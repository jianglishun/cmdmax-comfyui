import sys
import copy
import logging
import threading
import heapq
import traceback
import inspect
from typing import List, Literal, NamedTuple, Optional

import torch
import nodes

import comfy.model_management

def get_input_data(inputs, class_def, unique_id, outputs={}, prompt={}, extra_data={}):
    valid_inputs = class_def.INPUT_TYPES()
    input_data_all = {}
    for x in inputs:
        input_data = inputs[x]
        if isinstance(input_data, list):
            input_unique_id = input_data[0]
            output_index = input_data[1]
            if input_unique_id not in outputs:
                input_data_all[x] = (None,)
                continue
            obj = outputs[input_unique_id][output_index]
            input_data_all[x] = obj
        else:
            if ("required" in valid_inputs and x in valid_inputs["required"]) or ("optional" in valid_inputs and x in valid_inputs["optional"]):
                input_data_all[x] = [input_data]

    if "hidden" in valid_inputs:
        h = valid_inputs["hidden"]
        for x in h:
            if h[x] == "PROMPT":
                input_data_all[x] = [prompt]
            if h[x] == "EXTRA_PNGINFO":
                input_data_all[x] = [extra_data.get('extra_pnginfo', None)]
            if h[x] == "UNIQUE_ID":
                input_data_all[x] = [unique_id]
    return input_data_all

def map_node_over_list(obj, input_data_all, func, allow_interrupt=False):
    # check if node wants the lists
    input_is_list = False
    if hasattr(obj, "INPUT_IS_LIST"):
        input_is_list = obj.INPUT_IS_LIST

    if len(input_data_all) == 0:
        max_len_input = 0
    else:
        max_len_input = max([len(x) for x in input_data_all.values()])
     
    # get a slice of inputs, repeat last input when list isn't long enough
    def slice_dict(d, i):
        d_new = dict()
        for k,v in d.items():
            d_new[k] = v[i if len(v) > i else -1]
        return d_new
    
    results = []
    if input_is_list:
        if allow_interrupt:
            nodes.before_node_execution()
        results.append(getattr(obj, func)(**input_data_all))
    elif max_len_input == 0:
        if allow_interrupt:
            nodes.before_node_execution()
        results.append(getattr(obj, func)())
    else:
        for i in range(max_len_input):
            if allow_interrupt:
                nodes.before_node_execution()
            results.append(getattr(obj, func)(**slice_dict(input_data_all, i)))
    return results

def get_output_data(obj, input_data_all):
    
    results = []
    uis = []
    return_values = map_node_over_list(obj, input_data_all, obj.FUNCTION, allow_interrupt=True)

    for r in return_values:
        if isinstance(r, dict):
            if 'ui' in r:
                uis.append(r['ui'])
            if 'result' in r:
                results.append(r['result'])
        else:
            results.append(r)
    
    output = []
    if len(results) > 0:
        # check which outputs need concatenating
        output_is_list = [False] * len(results[0])
        if hasattr(obj, "OUTPUT_IS_LIST"):
            output_is_list = obj.OUTPUT_IS_LIST

        # merge node execution results
        for i, is_list in zip(range(len(results[0])), output_is_list):
            if is_list:
                output.append([x for o in results for x in o[i]])
            else:
                output.append([o[i] for o in results])

    ui = dict()    
    if len(uis) > 0:
        ui = {k: [y for x in uis for y in x[k]] for k in uis[0].keys()}
    return output, ui

def format_value(x):
    if x is None:
        return None
    elif isinstance(x, (int, float, bool, str)):
        return x
    else:
        return str(x)

def recursive_execute(server, prompt, outputs, current_item, extra_data, executed, prompt_id, outputs_ui, object_storage):
    unique_id = current_item
    inputs = prompt[unique_id]['inputs']
    class_type = prompt[unique_id]['class_type']
    class_def = nodes.NODE_CLASS_MAPPINGS[class_type]
    if unique_id in outputs:
        return (True, None, None)

    for x in inputs:
        input_data = inputs[x]

        if isinstance(input_data, list):
            input_unique_id = input_data[0]
            output_index = input_data[1]
            if input_unique_id not in outputs:
                result = recursive_execute(server, prompt, outputs, input_unique_id, extra_data, executed, prompt_id, outputs_ui, object_storage)
                if result[0] is not True:
                    # Another node failed further upstream
                    return result

    input_data_all = None
    try:
        input_data_all = get_input_data(inputs, class_def, unique_id, outputs, prompt, extra_data)
        if server.client_id is not None:
            server.last_node_id = unique_id
            server.send_sync("executing", { "node": unique_id, "prompt_id": prompt_id }, server.client_id)

        obj = object_storage.get((unique_id, class_type), None)
        if obj is None:
            obj = class_def()
            object_storage[(unique_id, class_type)] = obj

        output_data, output_ui = get_output_data(obj, input_data_all)
        outputs[unique_id] = output_data
        if len(output_ui) > 0:
            outputs_ui[unique_id] = output_ui
            if server.client_id is not None:
                server.send_sync("executed", { "node": unique_id, "output": output_ui, "prompt_id": prompt_id }, server.client_id)
    except comfy.model_management.InterruptProcessingException as iex:
        logging.info("Processing interrupted")

        # skip formatting inputs/outputs
        error_details = {
            "node_id": unique_id,
        }

        return (False, error_details, iex)
    except Exception as ex:
        typ, _, tb = sys.exc_info()
        exception_type = full_type_name(typ)
        input_data_formatted = {}
        if input_data_all is not None:
            input_data_formatted = {}
            for name, inputs in input_data_all.items():
                input_data_formatted[name] = [format_value(x) for x in inputs]

        output_data_formatted = {}
        for node_id, node_outputs in outputs.items():
            output_data_formatted[node_id] = [[format_value(x) for x in l] for l in node_outputs]

        logging.error(f"!!! Exception during processing!!! {ex}")
        logging.error(traceback.format_exc())

        error_details = {
            "node_id": unique_id,
            "exception_message": str(ex),
            "exception_type": exception_type,
            "traceback": traceback.format_tb(tb),
            "current_inputs": input_data_formatted,
            "current_outputs": output_data_formatted
        }
        return (False, error_details, ex)

    executed.add(unique_id)

    return (True, None, None)

def recursive_will_execute(prompt, outputs, current_item, memo={}):
    unique_id = current_item

    if unique_id in memo:
        return memo[unique_id]

    inputs = prompt[unique_id]['inputs']
    will_execute = []
    if unique_id in outputs:
        return []

    for x in inputs:
        input_data = inputs[x]
        if isinstance(input_data, list):
            input_unique_id = input_data[0]
            output_index = input_data[1]
            if input_unique_id not in outputs:
                will_execute += recursive_will_execute(prompt, outputs, input_unique_id, memo)

    memo[unique_id] = will_execute + [unique_id]
    return memo[unique_id]

def recursive_output_delete_if_changed(prompt, old_prompt, outputs, current_item):
    unique_id = current_item
    inputs = prompt[unique_id]['inputs']
    class_type = prompt[unique_id]['class_type']
    class_def = nodes.NODE_CLASS_MAPPINGS[class_type]

    is_changed_old = ''
    is_changed = ''
    to_delete = False
    if hasattr(class_def, 'IS_CHANGED'):
        if unique_id in old_prompt and 'is_changed' in old_prompt[unique_id]:
            is_changed_old = old_prompt[unique_id]['is_changed']
        if 'is_changed' not in prompt[unique_id]:
            input_data_all = get_input_data(inputs, class_def, unique_id, outputs)
            if input_data_all is not None:
                try:
                    #is_changed = class_def.IS_CHANGED(**input_data_all)
                    is_changed = map_node_over_list(class_def, input_data_all, "IS_CHANGED")
                    prompt[unique_id]['is_changed'] = is_changed
                except:
                    to_delete = True
        else:
            is_changed = prompt[unique_id]['is_changed']

    if unique_id not in outputs:
        return True

    if not to_delete:
        if is_changed != is_changed_old:
            to_delete = True
        elif unique_id not in old_prompt:
            to_delete = True
        elif inputs == old_prompt[unique_id]['inputs']:
            for x in inputs:
                input_data = inputs[x]

                if isinstance(input_data, list):
                    input_unique_id = input_data[0]
                    output_index = input_data[1]
                    if input_unique_id in outputs:
                        to_delete = recursive_output_delete_if_changed(prompt, old_prompt, outputs, input_unique_id)
                    else:
                        to_delete = True
                    if to_delete:
                        break
        else:
            to_delete = True

    if to_delete:
        d = outputs.pop(unique_id)
        del d
    return to_delete

class PromptExecutor:
    def __init__(self, server):
        self.server = server
        self.reset()

    def reset(self):
        self.outputs = {}
        self.object_storage = {}
        self.outputs_ui = {}
        self.status_messages = []
        self.success = True
        self.old_prompt = {}

    def add_message(self, event, data, broadcast: bool):
        self.status_messages.append((event, data))
        if self.server.client_id is not None or broadcast:
            self.server.send_sync(event, data, self.server.client_id)

    def handle_execution_error(self, prompt_id, prompt, current_outputs, executed, error, ex):
        node_id = error["node_id"]
        class_type = prompt[node_id]["class_type"]

        # First, send back the status to the frontend depending
        # on the exception type
        if isinstance(ex, comfy.model_management.InterruptProcessingException):
            mes = {
                "prompt_id": prompt_id,
                "node_id": node_id,
                "node_type": class_type,
                "executed": list(executed),
            }
            self.add_message("execution_interrupted", mes, broadcast=True)
        else:
            mes = {
                "prompt_id": prompt_id,
                "node_id": node_id,
                "node_type": class_type,
                "executed": list(executed),

                "exception_message": error["exception_message"],
                "exception_type": error["exception_type"],
                "traceback": error["traceback"],
                "current_inputs": error["current_inputs"],
                "current_outputs": error["current_outputs"],
            }
            self.add_message("execution_error", mes, broadcast=False)
        
        # Next, remove the subsequent outputs since they will not be executed
        to_delete = []
        for o in self.outputs:
            if (o not in current_outputs) and (o not in executed):
                to_delete += [o]
                if o in self.old_prompt:
                    d = self.old_prompt.pop(o)
                    del d
        for o in to_delete:
            d = self.outputs.pop(o)
            del d

    def execute(self, prompt, prompt_id, extra_data={}, execute_outputs=[]):
        nodes.interrupt_processing(False)

        if "client_id" in extra_data:
            self.server.client_id = extra_data["client_id"]
        else:
            self.server.client_id = None

        self.status_messages = []
        self.add_message("execution_start", { "prompt_id": prompt_id}, broadcast=False)

        with torch.inference_mode():
            #delete cached outputs if nodes don't exist for them
            to_delete = []
            for o in self.outputs:
                if o not in prompt:
                    to_delete += [o]
            for o in to_delete:
                d = self.outputs.pop(o)
                del d
            to_delete = []
            for o in self.object_storage:
                if o[0] not in prompt:
                    to_delete += [o]
                else:
                    p = prompt[o[0]]
                    if o[1] != p['class_type']:
                        to_delete += [o]
            for o in to_delete:
                d = self.object_storage.pop(o)
                del d

            for x in prompt:
                recursive_output_delete_if_changed(prompt, self.old_prompt, self.outputs, x)

            current_outputs = set(self.outputs.keys())
            for x in list(self.outputs_ui.keys()):
                if x not in current_outputs:
                    d = self.outputs_ui.pop(x)
                    del d

            comfy.model_management.cleanup_models(keep_clone_weights_loaded=True)
            self.add_message("execution_cached",
                          { "nodes": list(current_outputs) , "prompt_id": prompt_id},
                          broadcast=False)
            executed = set()
            output_node_id = None
            to_execute = []

            for node_id in list(execute_outputs):
                to_execute += [(0, node_id)]

            while len(to_execute) > 0:
                #always execute the output that depends on the least amount of unexecuted nodes first
                memo = {}
                to_execute = sorted(list(map(lambda a: (len(recursive_will_execute(prompt, self.outputs, a[-1], memo)), a[-1]), to_execute)))
                output_node_id = to_execute.pop(0)[-1]

                # This call shouldn't raise anything if there's an error deep in
                # the actual SD code, instead it will report the node where the
                # error was raised
                self.success, error, ex = recursive_execute(self.server, prompt, self.outputs, output_node_id, extra_data, executed, prompt_id, self.outputs_ui, self.object_storage)
                if self.success is not True:
                    self.handle_execution_error(prompt_id, prompt, current_outputs, executed, error, ex)
                    break

            for x in executed:
                self.old_prompt[x] = copy.deepcopy(prompt[x])
            self.server.last_node_id = None
            if comfy.model_management.DISABLE_SMART_MEMORY:
                comfy.model_management.unload_all_models()



def validate_inputs(prompt, item, validated):
    unique_id = item
    if unique_id in validated:
        return validated[unique_id]

    inputs = prompt[unique_id]['inputs']
    class_type = prompt[unique_id]['class_type']
    obj_class = nodes.NODE_CLASS_MAPPINGS[class_type]

    class_inputs = obj_class.INPUT_TYPES()
    required_inputs = class_inputs['required']

    errors = []
    valid = True

    validate_function_inputs = []
    if hasattr(obj_class, "VALIDATE_INPUTS"):
        validate_function_inputs = inspect.getfullargspec(obj_class.VALIDATE_INPUTS).args

    for x in required_inputs:
        if x not in inputs:
            error = {
                "type": "required_input_missing",
                "message": "Required input is missing",
                "details": f"{x}",
                "extra_info": {
                    "input_name": x
                }
            }
            errors.append(error)
            continue

        val = inputs[x]
        info = required_inputs[x]
        type_input = info[0]
        if isinstance(val, list):
            if len(val) != 2:
                error = {
                    "type": "bad_linked_input",
                    "message": "Bad linked input, must be a length-2 list of [node_id, slot_index]",
                    "details": f"{x}",
                    "extra_info": {
                        "input_name": x,
                        "input_config": info,
                        "received_value": val
                    }
                }
                errors.append(error)
                continue

            o_id = val[0]
            o_class_type = prompt[o_id]['class_type']
            r = nodes.NODE_CLASS_MAPPINGS[o_class_type].RETURN_TYPES
            if r[val[1]] != type_input:
                received_type = r[val[1]]
                details = f"{x}, {received_type} != {type_input}"
                error = {
                    "type": "return_type_mismatch",
                    "message": "Return type mismatch between linked nodes",
                    "details": details,
                    "extra_info": {
                        "input_name": x,
                        "input_config": info,
                        "received_type": received_type,
                        "linked_node": val
                    }
                }
                errors.append(error)
                continue
            try:
                r = validate_inputs(prompt, o_id, validated)
                if r[0] is False:
                    # `r` will be set in `validated[o_id]` already
                    valid = False
                    continue
            except Exception as ex:
                typ, _, tb = sys.exc_info()
                valid = False
                exception_type = full_type_name(typ)
                reasons = [{
                    "type": "exception_during_inner_validation",
                    "message": "Exception when validating inner node",
                    "details": str(ex),
                    "extra_info": {
                        "input_name": x,
                        "input_config": info,
                        "exception_message": str(ex),
                        "exception_type": exception_type,
                        "traceback": traceback.format_tb(tb),
                        "linked_node": val
                    }
                }]
                validated[o_id] = (False, reasons, o_id)
                continue
        else:
            try:
                if type_input == "INT":
                    val = int(val)
                    inputs[x] = val
                if type_input == "FLOAT":
                    val = float(val)
                    inputs[x] = val
                if type_input == "STRING":
                    val = str(val)
                    inputs[x] = val
            except Exception as ex:
                error = {
                    "type": "invalid_input_type",
                    "message": f"Failed to convert an input value to a {type_input} value",
                    "details": f"{x}, {val}, {ex}",
                    "extra_info": {
                        "input_name": x,
                        "input_config": info,
                        "received_value": val,
                        "exception_message": str(ex)
                    }
                }
                errors.append(error)
                continue

            if len(info) > 1:
                if "min" in info[1] and val < info[1]["min"]:
                    error = {
                        "type": "value_smaller_than_min",
                        "message": "Value {} smaller than min of {}".format(val, info[1]["min"]),
                        "details": f"{x}",
                        "extra_info": {
                            "input_name": x,
                            "input_config": info,
                            "received_value": val,
                        }
                    }
                    errors.append(error)
                    continue
                if "max" in info[1] and val > info[1]["max"]:
                    error = {
                        "type": "value_bigger_than_max",
                        "message": "Value {} bigger than max of {}".format(val, info[1]["max"]),
                        "details": f"{x}",
                        "extra_info": {
                            "input_name": x,
                            "input_config": info,
                            "received_value": val,
                        }
                    }
                    errors.append(error)
                    continue

            if x not in validate_function_inputs:
                if isinstance(type_input, list):
                    if val not in type_input:
                        input_config = info
                        list_info = ""

                        # Don't send back gigantic lists like if they're lots of
                        # scanned model filepaths
                        if len(type_input) > 20:
                            list_info = f"(list of length {len(type_input)})"
                            input_config = None
                        else:
                            list_info = str(type_input)

                        error = {
                            "type": "value_not_in_list",
                            "message": "Value not in list",
                            "details": f"{x}: '{val}' not in {list_info}",
                            "extra_info": {
                                "input_name": x,
                                "input_config": input_config,
                                "received_value": val,
                            }
                        }
                        errors.append(error)
                        continue

    if len(validate_function_inputs) > 0:
        input_data_all = get_input_data(inputs, obj_class, unique_id)
        input_filtered = {}
        for x in input_data_all:
            if x in validate_function_inputs:
                input_filtered[x] = input_data_all[x]

        #ret = obj_class.VALIDATE_INPUTS(**input_filtered)
        ret = map_node_over_list(obj_class, input_filtered, "VALIDATE_INPUTS")
        for x in input_filtered:
            for i, r in enumerate(ret):
                if r is not True:
                    details = f"{x}"
                    if r is not False:
                        details += f" - {str(r)}"

                    error = {
                        "type": "custom_validation_failed",
                        "message": "Custom validation failed for node",
                        "details": details,
                        "extra_info": {
                            "input_name": x,
                            "input_config": info,
                            "received_value": val,
                        }
                    }
                    errors.append(error)
                    continue

    if len(errors) > 0 or valid is not True:
        ret = (False, errors, unique_id)
    else:
        ret = (True, [], unique_id)

    validated[unique_id] = ret
    return ret

def full_type_name(klass):
    module = klass.__module__
    if module == 'builtins':
        return klass.__qualname__
    return module + '.' + klass.__qualname__


def validate_level(prompt):
    errors_list = []
    status = 202
    for item in prompt:
        if prompt[item]["class_type"] == "KSampler":
            inputs=prompt[item]["inputs"]
            steps=int(inputs["steps"])
            cfg = float(inputs["cfg"])
            denoise = float(inputs["denoise"])
            KSampler=False
            if steps>=5 and steps<=50:
                pass
            else:
                errors_list.append(f'steps = 5 <= {steps} <= 50 \n')
                KSampler=True

            if cfg>=1.0 and cfg<=10.0:
                pass
            else:
                errors_list.append(f'cfg = 1.0 <= {cfg} <= 10.0 \n')
                KSampler = True

            if denoise>=0.1 and denoise<=1.0:
                pass
            else:
                errors_list.append(f'denoise = 0.1 <= {denoise} <= 1.0 \n')
                KSampler = True

            if KSampler==True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "KSamplerAdvanced":
            inputs=prompt[item]["inputs"]
            steps=int(inputs["steps"])
            cfg = float(inputs["cfg"])
            start_at_step = int(inputs["start_at_step"])
            end_at_step = int(inputs["end_at_step"])
            KSamplerAdvanced=False
            if steps >= 5 and steps <= 50:
                pass
            else:
                errors_list.append(f'steps = 5 <= {steps} <= 50 \n')
                KSamplerAdvanced = True

            if cfg >= 1.0 and cfg <= 10.0:
                pass
            else:
                errors_list.append(f'cfg = 1.0 <= {cfg} <= 10.0 \n')
                KSamplerAdvanced = True

            if start_at_step>=0 and start_at_step<=1000:
                pass
            else:
                errors_list.append(f'start_at_step = 0 <= {start_at_step} <= 1000 \n')
                KSamplerAdvanced = True

            if end_at_step>=0 and end_at_step<=1000:
                pass
            else:
                errors_list.append(f'end_at_step = 0 <= {end_at_step} <= 1000 \n')
                KSamplerAdvanced = True

            if KSamplerAdvanced==True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "EmptyLatentImage":
            inputs=prompt[item]["inputs"]
            #width=int(inputs["width"])
            if isinstance(inputs["width"], list):
                if len(inputs["width"]) > 0:
                    width = int(inputs["width"][0])
                else:
                    width = 0
            else:
                width = int(inputs["width"])

            #height = int(inputs["height"])
            if isinstance(inputs["height"], list):
                if len(inputs["height"]) > 0:
                    height = int(inputs["height"][0])
                else:
                    height = 0
            else:
                height = int(inputs["height"])

            batch_size = int(inputs["batch_size"])
            EmptyLatentImage=False
            if width >= 0 and width <= 1024:
                pass
            else:
                errors_list.append(f'width = 0 <= {width} <= 1024 \n')
                EmptyLatentImage = True

            if height >= 0 and height <= 1024:
                pass
            else:
                errors_list.append(f'height = 0 <= {height} <= 1024 \n')
                EmptyLatentImage = True

            if batch_size>=1 and batch_size<=100:
                pass
            else:
                errors_list.append(f'batch_size = 1 <= {batch_size} <= 100 \n')
                EmptyLatentImage = True

            if EmptyLatentImage==True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "CLIPTextEncode":
            inputs=prompt[item]["inputs"]
            text=len(inputs["text"])
            CLIPTextEncode=False
            if text >= 0 and text <= 2000:
                pass
            else:
                errors_list.append(f'text = 0 <= {text} <= 2000 \n')
                CLIPTextEncode = True

            if CLIPTextEncode==True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "CLIPTextEncodeSDXL":
            inputs=prompt[item]["inputs"]
            width=int(inputs["width"])
            height = int(inputs["height"])
            target_width=int(inputs["target_width"])
            target_height = int(inputs["target_height"])
            text_g=len(inputs["text_g"])
            text_l = len(inputs["text_l"])
            CLIPTextEncodeSDXL=False

            if width >= 1024 and width <= 2048:
                pass
            else:
                errors_list.append(f'width = 1024 <= {width} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if height >= 1024 and height <= 2048:
                pass
            else:
                errors_list.append(f'height = 1024 <= {height} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if target_width >= 1024 and target_width <= 2048:
                pass
            else:
                errors_list.append(f'target_width = 1024 <= {target_width} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if target_height >= 1024 and target_height <= 2048:
                pass
            else:
                errors_list.append(f'target_height = 1024 <= {target_height} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if text_g >= 0  and text_g <= 300:
                pass
            else:
                errors_list.append(f'text_g = 0 <= {text_g} <= 300 \n')
                CLIPTextEncodeSDXL = True

            if text_l >= 0 and text_l <= 300:
                pass
            else:
                errors_list.append(f'text_l = 0 <= {text_l} <= 300 \n')
                CLIPTextEncodeSDXL = True

            if CLIPTextEncodeSDXL==True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "CLIPTextEncodeSDXL":
            inputs = prompt[item]["inputs"]
            width = int(inputs["width"])
            height = int(inputs["height"])
            target_width = int(inputs["target_width"])
            target_height = int(inputs["target_height"])
            text_g = len(inputs["text_g"])
            text_l = len(inputs["text_l"])
            CLIPTextEncodeSDXL = False

            if width >= 1024 and width <= 2048:
                pass
            else:
                errors_list.append(f'width = 1024 <= {width} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if height >= 1024 and height <= 2048:
                pass
            else:
                errors_list.append(f'height = 1024 <= {height} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if target_width >= 1024 and target_width <= 2048:
                pass
            else:
                errors_list.append(f'target_width = 1024 <= {target_width} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if target_height >= 1024 and target_height <= 2048:
                pass
            else:
                errors_list.append(f'target_height = 1024 <= {target_height} <= 2048 \n')
                CLIPTextEncodeSDXL = True

            if text_g >= 0 and text_g <= 300:
                pass
            else:
                errors_list.append(f'text_g = 0 <= {text_g} <= 300 \n')
                CLIPTextEncodeSDXL = True

            if text_l >= 0 and text_l <= 300:
                pass
            else:
                errors_list.append(f'text_l = 0 <= {text_l} <= 300 \n')
                CLIPTextEncodeSDXL = True

            if CLIPTextEncodeSDXL == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "CLIPTextEncodeSDXLRefiner":
            inputs = prompt[item]["inputs"]
            width = int(inputs["width"])
            height = int(inputs["height"])
            text = len(inputs["text"])
            CLIPTextEncodeSDXLRefiner = False

            if width >= 1024 and width <= 2048:
                pass
            else:
                errors_list.append(f'width = 1024 <= {width} <= 2048 \n')
                CLIPTextEncodeSDXLRefiner = True

            if height >= 1024 and height <= 2048:
                pass
            else:
                errors_list.append(f'height = 1024 <= {height} <= 2048 \n')
                CLIPTextEncodeSDXLRefiner = True

            if text >= 0 and text <= 500:
                pass
            else:
                errors_list.append(f'text = 0 <= {text} <= 500 \n')
                CLIPTextEncodeSDXLRefiner = True

            if CLIPTextEncodeSDXLRefiner == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "ImageBlend":
            inputs = prompt[item]["inputs"]
            blend_factor = float(inputs["blend_factor"])
            ImageBlend = False

            if blend_factor >= 0.1 and blend_factor <= 1.0:
                pass
            else:
                errors_list.append(f'blend_factor = 0.1 <= {blend_factor} <= 1.0 \n')
                ImageBlend = True

            if ImageBlend == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "LatentUpscale":
            # print(prompt[item]["class_type"])
            inputs = prompt[item]["inputs"]
            width = int(inputs["width"])
            height = int(inputs["height"])
            LatentUpscale = False

            if width >= 512 and width <= 1024:
                pass
            else:
                errors_list.append(f'width = 512 <= {width} <= 1024 \n')
                LatentUpscale = True

            if height >= 512 and height <= 1024:
                pass
            else:
                errors_list.append(f'height = 512 <= {height} <= 1024 \n')
                LatentUpscale = True

            if LatentUpscale == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "MiDaS-DepthMapPreprocessor":
            # print(prompt[item]["class_type"])
            inputs = prompt[item]["inputs"]
            a = float(inputs["a"])
            bg_threshold = float(inputs["bg_threshold"])
            resolution = int(inputs["resolution"])
            MiDaS_DepthMapPreprocessor = False

            if a >= 1.0 and a <= 10.0:
                pass
            else:
                errors_list.append(f'a = 1.0  <= {width} <= 10.0 \n')
                MiDaS_DepthMapPreprocessor = True

            if bg_threshold >= 0.05 and bg_threshold <= 1.0:
                pass
            else:
                errors_list.append(f'bg_threshold = 0.05 <= {bg_threshold} <= 1.0 \n')
                MiDaS_DepthMapPreprocessor = True

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                MiDaS_DepthMapPreprocessor = True

            if MiDaS_DepthMapPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "LoraLoader":
            inputs = prompt[item]["inputs"]
            strength_model = float(inputs["strength_model"])
            strength_clip = float(inputs["strength_clip"])
            LoraLoader = False

            if strength_model >= 0.1 and strength_model <= 1.0:
                pass
            else:
                errors_list.append(f'strength_model = 0.1 <= {strength_model} <= 1.0 \n')
                LoraLoader = True

            if strength_clip >= 0.1 and strength_clip <= 1.0:
                pass
            else:
                errors_list.append(f'strength_clip = 0.1 <= {strength_clip} <= 1.0 \n')
                LoraLoader = True

            if LoraLoader == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "ControlNetApplyAdvanced":
            inputs = prompt[item]["inputs"]
            strength = float(inputs["strength"])
            start_percent = float(inputs["start_percent"])
            end_percent = float(inputs["end_percent"])
            ControlNetApplyAdvanced = False

            if strength >= 0.1 and strength <= 1.0:
                pass
            else:
                errors_list.append(f'strength = 0.1 <= {strength} <= 1.0 \n')
                ControlNetApplyAdvanced = True

            if start_percent >= 0 and start_percent <= 1.0:
                pass
            else:
                errors_list.append(f'start_percent = 0 <= {start_percent} <= 1.0 \n')
                ControlNetApplyAdvanced = True

            if end_percent >= 0 and end_percent <= 1.0:
                pass
            else:
                errors_list.append(f'end_percent = 0 <= {end_percent} <= 1.0 \n')
                ControlNetApplyAdvanced = True

            if ControlNetApplyAdvanced == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "Canny":
            inputs = prompt[item]["inputs"]
            low_threshold = float(inputs["low_threshold"])
            high_threshold = float(inputs["high_threshold"])
            Canny = False

            if low_threshold >= 0.01 and low_threshold <= 1.0:
                pass
            else:
                errors_list.append(f'low_threshold = 0.01 <= {low_threshold} <= 1.0 \n')
                Canny = True

            if high_threshold >= 0.1 and high_threshold <= 1.0:
                pass
            else:
                errors_list.append(f'high_threshold = 0.1 <= {high_threshold} <= 1.0 \n')
                Canny = True

            if Canny == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "PiDiNetPreprocessor":
            inputs = prompt[item]["inputs"]
            resolution = int(inputs["resolution"])
            PiDiNetPreprocessor = False

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                PiDiNetPreprocessor = True

            if PiDiNetPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "Zoe-DepthMapPreprocessor":
            inputs = prompt[item]["inputs"]
            resolution = int(inputs["resolution"])
            Zoe_DepthMapPreprocessor = False

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                Zoe_DepthMapPreprocessor = True

            if Zoe_DepthMapPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "DWPreprocessor":
            inputs = prompt[item]["inputs"]
            resolution = int(inputs["resolution"])
            DWPreprocessor = False

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                DWPreprocessor = True

            if DWPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "MediaPipe-FaceMeshPreprocessor":
            inputs = prompt[item]["inputs"]
            max_faces = int(inputs["max_faces"])
            min_confidence = float(inputs["min_confidence"])
            resolution = int(inputs["resolution"])
            MediaPipe_FaceMeshPreprocessor = False

            if max_faces >= 1 and max_faces <= 10:
                pass
            else:
                errors_list.append(f'max_faces = 1 <= {max_faces} <= 10 \n')
                MediaPipe_FaceMeshPreprocessor = True

            if min_confidence >= 0.1 and min_confidence <= 1.0:
                pass
            else:
                errors_list.append(f'min_confidence = 0.1 <= {min_confidence} <= 1.0 \n')
                MediaPipe_FaceMeshPreprocessor = True

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                MediaPipe_FaceMeshPreprocessor = True

            if MediaPipe_FaceMeshPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "MiDaS-NormalMapPreprocessor":
            inputs = prompt[item]["inputs"]
            a = float(inputs["a"])
            bg_threshold = float(inputs["bg_threshold"])
            resolution = int(inputs["resolution"])
            MediaPipe_FaceMeshPreprocessor = False

            if a >= 1.0 and a <= 10.0:
                pass
            else:
                errors_list.append(f'a = 1.0 <= {a} <= 10.0 \n')
                MediaPipe_FaceMeshPreprocessor = True

            if bg_threshold >= 0.1 and bg_threshold <= 1.0:
                pass
            else:
                errors_list.append(f'bg_threshold = 0.1 <= {bg_threshold} <= 1.0 \n')
                MediaPipe_FaceMeshPreprocessor = True

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                MediaPipe_FaceMeshPreprocessor = True

            if MediaPipe_FaceMeshPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "FakeScribblePreprocessor":
            inputs = prompt[item]["inputs"]
            resolution = int(inputs["resolution"])
            FakeScribblePreprocessor = False

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                FakeScribblePreprocessor = True

            if FakeScribblePreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')

        if prompt[item]["class_type"] == "BAE-NormalMapPreprocessor":
            inputs = prompt[item]["inputs"]
            resolution = int(inputs["resolution"])
            BAE_NormalMapPreprocessor = False

            if resolution >= 512 and resolution <= 1024:
                pass
            else:
                errors_list.append(f'resolution = 512 <= {resolution} <= 1024 \n')
                BAE_NormalMapPreprocessor = True

            if BAE_NormalMapPreprocessor == True:
                errors_list.append(f'-------------------------{prompt[item]["class_type"]}-------------------------\n')


    print(errors_list)
    return errors_list

def validate_prompt(prompt):
    outputs = set()
    for x in prompt:
        if 'class_type' not in prompt[x]:
            error = {
                "type": "invalid_prompt",
                "message": f"Cannot execute because a node is missing the class_type property.",
                "details": f"Node ID '#{x}'",
                "extra_info": {}
            }
            return (False, error, [], [])

        class_type = prompt[x]['class_type']
        class_ = nodes.NODE_CLASS_MAPPINGS.get(class_type, None)
        if class_ is None:
            error = {
                "type": "invalid_prompt",
                "message": f"Cannot execute because node {class_type} does not exist.",
                "details": f"Node ID '#{x}'",
                "extra_info": {}
            }
            return (False, error, [], [])

        if hasattr(class_, 'OUTPUT_NODE') and class_.OUTPUT_NODE is True:
            outputs.add(x)

    if len(outputs) == 0:
        error = {
            "type": "prompt_no_outputs",
            "message": "Prompt has no outputs",
            "details": "",
            "extra_info": {}
        }
        return (False, error, [], [])

    errors_list=validate_level(prompt)          
    if len(errors_list)>0:
        error = {
            "type": "prompt_outputs_failed_validation",
            "message": "Prompt outputs failed validation,Parameter constraints \n",
            "details": errors_list,
            "extra_info": {}
        }
        return (False, error, [], [])
    
    good_outputs = set()
    errors = []
    node_errors = {}
    validated = {}
    for o in outputs:
        valid = False
        reasons = []
        try:
            m = validate_inputs(prompt, o, validated)
            valid = m[0]
            reasons = m[1]
        except Exception as ex:
            typ, _, tb = sys.exc_info()
            valid = False
            exception_type = full_type_name(typ)
            reasons = [{
                "type": "exception_during_validation",
                "message": "Exception when validating node",
                "details": str(ex),
                "extra_info": {
                    "exception_type": exception_type,
                    "traceback": traceback.format_tb(tb)
                }
            }]
            validated[o] = (False, reasons, o)

        if valid is True:
            good_outputs.add(o)
        else:
            logging.error(f"Failed to validate prompt for output {o}:")
            if len(reasons) > 0:
                logging.error("* (prompt):")
                for reason in reasons:
                    logging.error(f"  - {reason['message']}: {reason['details']}")
            errors += [(o, reasons)]
            for node_id, result in validated.items():
                valid = result[0]
                reasons = result[1]
                # If a node upstream has errors, the nodes downstream will also
                # be reported as invalid, but there will be no errors attached.
                # So don't return those nodes as having errors in the response.
                if valid is not True and len(reasons) > 0:
                    if node_id not in node_errors:
                        class_type = prompt[node_id]['class_type']
                        node_errors[node_id] = {
                            "errors": reasons,
                            "dependent_outputs": [],
                            "class_type": class_type
                        }
                        logging.error(f"* {class_type} {node_id}:")
                        for reason in reasons:
                            logging.error(f"  - {reason['message']}: {reason['details']}")
                    node_errors[node_id]["dependent_outputs"].append(o)
            logging.error("Output will be ignored")

    if len(good_outputs) == 0:
        errors_list = []
        for o, errors in errors:
            for error in errors:
                errors_list.append(f"{error['message']}: {error['details']}")
        errors_list = "\n".join(errors_list)

        error = {
            "type": "prompt_outputs_failed_validation",
            "message": "Prompt outputs failed validation",
            "details": errors_list,
            "extra_info": {}
        }

        return (False, error, list(good_outputs), node_errors)

    return (True, None, list(good_outputs), node_errors)

MAXIMUM_HISTORY_SIZE = 10000

class PromptQueue:
    def __init__(self, server):
        self.server = server
        self.mutex = threading.RLock()
        self.not_empty = threading.Condition(self.mutex)
        self.task_counter = 0
        self.queue = []
        self.currently_running = {}
        self.history = {}
        self.flags = {}
        server.prompt_queue = self

    def put(self, item):
        with self.mutex:
            heapq.heappush(self.queue, item)
            self.server.queue_updated()
            self.not_empty.notify()

    def get(self, timeout=None):
        with self.not_empty:
            while len(self.queue) == 0:
                self.not_empty.wait(timeout=timeout)
                if timeout is not None and len(self.queue) == 0:
                    return None
            item = heapq.heappop(self.queue)
            i = self.task_counter
            self.currently_running[i] = copy.deepcopy(item)
            self.task_counter += 1
            self.server.queue_updated()
            return (item, i)

    class ExecutionStatus(NamedTuple):
        status_str: Literal['success', 'error']
        completed: bool
        messages: List[str]

    def task_done(self, item_id, outputs,
                  status: Optional['PromptQueue.ExecutionStatus']):
        with self.mutex:
            prompt = self.currently_running.pop(item_id)
            if len(self.history) > MAXIMUM_HISTORY_SIZE:
                self.history.pop(next(iter(self.history)))

            status_dict: Optional[dict] = None
            if status is not None:
                status_dict = copy.deepcopy(status._asdict())

            self.history[prompt[1]] = {
                "prompt": prompt,
                "outputs": copy.deepcopy(outputs),
                'status': status_dict,
            }
            self.server.queue_updated()

    def get_current_queue(self):
        with self.mutex:
            out = []
            for x in self.currently_running.values():
                out += [x]
            return (out, copy.deepcopy(self.queue))

    def get_tasks_remaining(self):
        with self.mutex:
            return len(self.queue) + len(self.currently_running)

    def wipe_queue(self):
        with self.mutex:
            self.queue = []
            self.server.queue_updated()

    def delete_queue_item(self, function):
        with self.mutex:
            for x in range(len(self.queue)):
                if function(self.queue[x]):
                    if len(self.queue) == 1:
                        self.wipe_queue()
                    else:
                        self.queue.pop(x)
                        heapq.heapify(self.queue)
                    self.server.queue_updated()
                    return True
        return False

    def get_history(self, prompt_id=None, max_items=None, offset=-1):
        with self.mutex:
            if prompt_id is None:
                out = {}
                i = 0
                if offset < 0 and max_items is not None:
                    offset = len(self.history) - max_items
                for k in self.history:
                    if i >= offset:
                        out[k] = self.history[k]
                        if max_items is not None and len(out) >= max_items:
                            break
                    i += 1
                return out
            elif prompt_id in self.history:
                return {prompt_id: copy.deepcopy(self.history[prompt_id])}
            else:
                return {}

    def wipe_history(self):
        with self.mutex:
            self.history = {}

    def delete_history_item(self, id_to_delete):
        with self.mutex:
            self.history.pop(id_to_delete, None)

    def set_flag(self, name, data):
        with self.mutex:
            self.flags[name] = data
            self.not_empty.notify()

    def get_flags(self, reset=True):
        with self.mutex:
            if reset:
                ret = self.flags
                self.flags = {}
                return ret
            else:
                return self.flags.copy()
