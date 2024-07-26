import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";
import { LOCALES } from "./LocaleMap.js";
import { applyMenuTranslation, observeFactory } from "./MenuTranslate.js";
// Translation Utils
export class TUtils {
	static LOCALE_ID = "AGL.Locale";
	static LOCALE_ID_LAST = "AGL.LocaleLast";

	static T = {
		Menu: {},
		Nodes: {},
		NodeCategory: {},
		Locales: LOCALES
	};
	static ELS = {};

	static setLocale(locale) {
		localStorage[TUtils.LOCALE_ID_LAST] = localStorage.getItem(TUtils.LOCALE_ID) || "en-US";
		localStorage[TUtils.LOCALE_ID] = locale;
		TUtils.syncTranslation();
	}

	static syncTranslation(OnFinished = () => { }) {
		var locale = localStorage.getItem(TUtils.LOCALE_ID) || "zh-CN";
		var url = "/agl/get_translation";
		var request = new XMLHttpRequest();
		request.open("post", url);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.send(`locale=${locale}`);
		request.onload = function () {
			/* XHR对象获取到返回信息后执行 */
			if (request.status != 200)
				return;
			var resp = JSON.parse(request.responseText);
			for (var key in TUtils.T) {
				if (key in resp)
					TUtils.T[key] = resp[key];
				else
					TUtils.T[key] = {};
			}
			TUtils.T.Locales = LOCALES;
			// 合并NodeCategory 到 Menu
			TUtils.Menu = Object.assign(TUtils.T.Menu, TUtils.T.NodeCategory);
			// 提取 Node 中 key 到 Menu
			for (let key in TUtils.T.Nodes) {
				let node = TUtils.T.Nodes[key];
				TUtils.Menu[key] = node["title"] || key;
			}
			OnFinished();
		};
	}

	static asyncTranslation() {
		return new Promise(function (resolve, reject) {
			TUtils.syncTranslation(() => { resolve(1); });
		});
	}

	static applyNodeTypeTranslation(app) {
		// let nodeCT = this.T.NodeCategory;
		let nodesT = this.T.Nodes;
		for (let nodeName in LiteGraph.registered_node_types) {
			var nodeType = LiteGraph.registered_node_types[nodeName];
			// for (let key in nodeCT) {
			// 	if (!nodeType.category.includes(key))
			// 		continue;
			// 	nodeType.category = nodeType.category.replace(key, nodeCT[key]);
			// }
			let class_type = nodeType.comfyClass ? nodeType.comfyClass : nodeType.type;
			if (nodesT.hasOwnProperty(class_type)) {
				nodeType.title = nodesT[class_type]["title"] || nodeType.title;
			}
		}
	}

	static applyNodeTranslation(node) {
		let keys = ["inputs", "outputs", "widgets"];
		let nodesT = this.T.Nodes;
		let class_type = node.constructor.comfyClass ? node.constructor.comfyClass : node.constructor.type;
		if (!nodesT.hasOwnProperty(class_type)) {
			for (let key of keys) {
				if (!node.hasOwnProperty(key))
					continue;
				node[key].forEach(item => {
					if (item?.hasOwnProperty("name"))
						item.label = item.name;
				});
			}
			return;
		}
		var t = nodesT[class_type];
		for (let key of keys) {
			if (!t.hasOwnProperty(key))
				continue;
			if (!node.hasOwnProperty(key))
				continue;
			node[key].forEach(item => {
				if (item?.name in t[key]) {
					item.label = t[key][item.name];
				}
			});
		}
		if (t.hasOwnProperty("title")) {
			node.title = t["title"];
			node.constructor.title = t["title"];
		};
		// 转换 widget 到 input 时需要刷新socket信息
		let addInput = node.addInput;
		node.addInput = function (name, type, extra_info) {
			var oldInputs = [];
			this.inputs?.forEach(i => oldInputs.push(i.name));
			var res = addInput.apply(this, arguments);
			this.inputs?.forEach(i => {
				if (oldInputs.includes(i.name))
					return;
				if (t["widgets"] && i.widget?.name in t["widgets"]) {
					i.label = t["widgets"][i.widget?.name];
				}
			});
			return res;
		};
	}

	static applyMenuTranslation(app) {
		// 搜索菜单 常驻菜单
		applyMenuTranslation(TUtils.T);
		// Queue size 单独处理
		observeFactory(app.ui.menuContainer.querySelector(".drag-handle").childNodes[1], (mutationsList, observer) => {
			for (let mutation of mutationsList) {
				for (let node of mutation.addedNodes) {
					var match = node.data.match(/(Queue size:) (\w+)/);
					if (match?.length == 3) {
						const t = TUtils.T.Menu[match[1]] ? TUtils.T.Menu[match[1]] : match[1];
						node.data = t + " " + match[2];
					}
				}
			}
		});
	}

	static applyContextMenuTranslation(app) {
		// 右键上下文菜单
		var f = LGraphCanvas.prototype.getCanvasMenuOptions;
		LGraphCanvas.prototype.getCanvasMenuOptions = function () {
			var res = f.apply(this, arguments);
			let menuT = TUtils.T.Menu;
			for (let item of res) {
				if (item == null || !item.hasOwnProperty("content"))
					continue;
				if (item.content in menuT) {
					item.content = menuT[item.content];
				}
			}
			return res;
		};
		const f2 = LiteGraph.ContextMenu;
		LiteGraph.ContextMenu = function (values, options) {
			if (options.hasOwnProperty("title") && options.title in TUtils.T.Nodes) {
				options.title = TUtils.T.Nodes[options.title]["title"] || options.title;
			}
			// Convert {w.name} to input
			// Convert {w.name} to widget
			var t = TUtils.T.Menu;
			var reInput = /Convert (.*) to input/;
			var reWidget = /Convert (.*) to widget/;
			var cvt = t["Convert "] || "Convert ";
			var tinp = t[" to input"] || " to input";
			var twgt = t[" to widget"] || " to widget";
			for (let value of values) {
				if (value == null || !value.hasOwnProperty("content"))
					continue;
				// inputs
				if (value.content in t) {
					value.content = t[value.content];
					continue;
				}
				// widgets and inputs
				var matchInput = value.content?.match(reInput);
				if (matchInput) {
					var match = matchInput[1];
					options.extra.inputs?.find(i => {
						if (i.name != match)
							return false;
						match = i.label ? i.label : i.name;
					});
					options.extra.widgets?.find(i => {
						if (i.name != match)
							return false;
						match = i.label ? i.label : i.name;
					});
					value.content = cvt + match + tinp;
					continue;
				}
				var matchWidget = value.content?.match(reWidget);
				if (matchWidget) {
					var match = matchWidget[1];
					options.extra.inputs?.find(i => {
						if (i.name != match)
							return false;
						match = i.label ? i.label : i.name;
					});
					options.extra.widgets?.find(i => {
						if (i.name != match)
							return false;
						match = i.label ? i.label : i.name;
					});
					value.content = cvt + match + twgt;
					continue;
				}
			}

			const ctx = f2.call(this, values, options);
			return ctx;
		}
		LiteGraph.ContextMenu.prototype = f2.prototype;
		// search box
		// var f3 = LiteGraph.LGraphCanvas.prototype.showSearchBox;
		// LiteGraph.LGraphCanvas.prototype.showSearchBox = function (event) {
		// 	var res = f3.apply(this, arguments);
		// 	var t = TUtils.T.Menu;
		// 	var name = this.search_box.querySelector(".name");
		// 	if (name.innerText in t)
		// 		name.innerText = t[name.innerText];
		// 	t = TUtils.T.Nodes;
		// 	var helper = this.search_box.querySelector(".helper");
		// 	var items = helper.getElementsByClassName("litegraph lite-search-item");
		// 	for (let item of items) {
		// 		if (item.innerText in t)
		// 			item.innerText = t[item.innerText]["title"];
		// 	}
		// 	return res;
		// };
		// LiteGraph.LGraphCanvas.prototype.showSearchBox.prototype = f3.prototype;
	}

	static addSettingsMenuOptions(app) {
		let id = this.LOCALE_ID;
		app.ui.settings.addSetting({
			id: id,
			name: "Locale",
			type: (name, setter, value) => {
				const options = [
					...Object.entries(TUtils.T.Locales).map(v => {
						let nativeName = v[1].nativeName;
						let englishName = "";
						if (v[1].englishName != nativeName)
							englishName = ` [${v[1].englishName}]`;
						return $el("option", {
							textContent: v[1].nativeName + englishName,
							value: v[0],
							selected: v[0] === value
						});
					})
				];

				TUtils.ELS.select = $el("select", {
					style: {
						marginBottom: "0.15rem",
						width: "100%",
					},
					onchange: (e) => {
						setter(e.target.value);
					}
				}, options)

				return $el("tr", [
					$el("td", [
						$el("label", {
							for: id.replaceAll(".", "-"),
							textContent: "AGLTranslation-langualge",
						}),
					]),
					$el("td", [
						TUtils.ELS.select,
						$el("div", {
							style: {
								display: "grid",
								gap: "4px",
								gridAutoFlow: "column",
							},
						})]),
				])
			},
			defaultValue: "en-US",
			async onChange(value) {
				if (!value)
					return;
				if (value != localStorage[id]) {
					TUtils.setLocale(value);
					location.reload();
				}
				localStorage[id] = value;
			},
		});
	}
}


const ext = {
	name: "AIGODLIKE.Translation",
	async init(app) {
		// Any initial setup to run as soon as the page loads
		TUtils.syncTranslation();
		return;

		var f = app.graphToPrompt;
		app.graphToPrompt = async function () {
			var res = await f.apply(this, arguments);
			if (res.hasOwnProperty("workflow")) {
				for (let node of res.workflow.nodes) {
					if (node.inputs == undefined)
						continue;
					if (!(node.type in TRANSLATIONS && TRANSLATIONS[node.type].hasOwnProperty("inputs")))
						continue;
					for (let input of node.inputs) {
						var t_inputs = TRANSLATIONS[node.type]["inputs"];
						for (let name in t_inputs) {
							if (input.name == t_inputs[name]) {
								input.name = name;
							}
						}
					}
				}
			};
			if (res.hasOwnProperty("output")) {
				for (let oname in res.output) {
					let o = res.output[oname];
					if (o.inputs == undefined)
						continue;
					if (!(o.class_type in TRANSLATIONS && TRANSLATIONS[o.class_type].hasOwnProperty("widgets")))
						continue;

					var t_inputs = TRANSLATIONS[o.class_type]["widgets"];
					var rm_keys = [];
					for (let iname in o.inputs) {
						for (let name in t_inputs) {
							if (iname == name) // 没有翻译的不管
								continue;
							if (iname == t_inputs[name]) {
								o.inputs[name] = o.inputs[iname];
								rm_keys.push(iname);
							}
						}
					}
					for (let rm_key of rm_keys) {
						delete o.inputs[rm_key];
					}
				}
			};
			return res;
		};

	},
	async setup(app) {
		TUtils.applyNodeTypeTranslation(app);
		TUtils.applyContextMenuTranslation(app);
		TUtils.applyMenuTranslation(app);
		TUtils.addSettingsMenuOptions(app);
		// 构造设置面板
		// this.settings = new AGLSettingsDialog();
		// 添加按钮
		app.ui.menuContainer.appendChild(
			$el("button.agl-swlocale-btn", {
				id: "swlocale-button",
				textContent: TUtils.T.Menu["Switch Locale"] || "Switch Locale",
				onclick: () => {
					var localeLast = localStorage.getItem(TUtils.LOCALE_ID_LAST) || "en-US";
					var locale = localStorage.getItem(TUtils.LOCALE_ID) || "en-US";
					if (locale != "en-US" && localeLast != "en-US")
						localeLast = "en-US";
					if (locale != localeLast) {
						app.ui.settings.setSettingValue(TUtils.LOCALE_ID, localeLast);
						TUtils.setLocale(localeLast);
						location.reload();
					}
				},
			}));
	},
	async addCustomNodeDefs(defs, app) {
		// Add custom node definitions
		// These definitions will be configured and registered automatically
		// defs is a lookup core nodes, add yours into this
		// console.log("[logging]", "add custom node definitions", "current nodes:", Object.keys(defs));
	},
	async getCustomWidgets(app) {
		// Return custom widget types
		// See ComfyWidgets for widget examples
		// console.log("[logging]", "provide custom widgets");
	},
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		// Run custom logic before a node definition is registered with the graph
		// console.log("[logging]", "before register node: ", nodeType.comfyClass);
		// This fires for every node definition so only log once
		// applyNodeTranslationDef(nodeType, nodeData);
		// delete ext.beforeRegisterNodeDef;
	},
	async registerCustomNodes(app) {
		// Register any custom node implementations here allowing for more flexability than a custom node def
		// console.log("[logging]", "register custom nodes");
	},
	loadedGraphNode(node, app) {
		// Fires for each node when loading/dragging/etc a workflow json or png
		// If you break something in the backend and want to patch workflows in the frontend
		// This fires for every node on each load so only log once
		// delete ext.loadedGraphNode;
		TUtils.applyNodeTranslation(node);
	},
	nodeCreated(node, app) {
		// Fires every time a node is constructed
		// You can modify widgets/add handlers/etc here
		TUtils.applyNodeTranslation(node);
	}
};

app.registerExtension(ext);
