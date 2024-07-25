/**
 * Created by wangminrui2022 on 2024-05-19.
 */
import { api } from "./api.js"
import { ifct } from "./iface_client.js"

var server_error=false;
var server_close=false;
var ws =null;

export class WebsocketTool {

	constructor() {
	    console.log("websocket_tool.js");
	}

    websocket_handler(reqest_data,is_reconnect,call_back){
        var string_socket_data=JSON.stringify(reqest_data);
        ws_tool.create_connect(string_socket_data,function(result){
              console.log("trans_code="+result.trans_code+" status="+result.status);
            switch(result.trans_code){
                case "websocket_code_001":
                    ws_tool.login_status();
                    $('#modalSignin').modal('hide');
                    $('#loading-modal').modal('hide');
                    $('#centeredModalToggle').modal('hide');
                    var parseMessage=JSON.parse(result.data.message);
                    if(result.status==200){
                        call_back({"status":200,"data":parseMessage});
                    }else{
                        $('#modalSignin').modal('hide');
                        $('#loading-modal').modal('hide');
                        $('#centeredModalToggle').modal('show');
                        let text="";
                        if(result.status==205){
                            text=parseMessage.message+" 🙎‍♂️"+parseMessage.online+" Click Confirm to jump to the idle server";
                            let src="../img/busy.png";
                            if(reqest_data.params!=undefined){
                                ws_tool.centeredModelShowURL(text,src,"http://"+parseMessage.h+"/?"+reqest_data.params);
                            }else{
                                ws_tool.centeredModelShowURL(text,src,"http://"+parseMessage.h);
                            }
                        }else{//206
                            text=parseMessage.message+" 🙎‍♂️"+parseMessage.online+" The server is busy, please come back later.";
                            let src="../img/1_2.gif";
                            ws_tool.centeredModelShow(text,src);
                        }
                        call_back({"status":result.status,"err":text});
                    }
                    break;
                case "websocket_code_004":
                        $('#modalSignin').modal('hide');
                        $('#loading-modal').modal('hide');
                        $('#centeredModalToggle').modal('show');

                        var parseMessage=JSON.parse(result.data.message);
                        let text="If your account is logged in elsewhere, click OK to refresh. 👉 "+parseMessage.remoteAddress;
                        let src="../img/3_2.gif";
                        ws_tool.centeredModelShowReload(text,src);
                    break;
                case "websocket_code_017":
                    if(result.status==200){
                        console.log("websocket_code_017."+server_error);
                        if(server_error==true){
                            ws_tool.login_status();

                            $('#modalSignin').modal('hide');
                            $('#loading-modal').modal('hide');
                            $('#centeredModalToggle').modal('show');

                            let text="disconnect from server";
                            let src="../img/server.gif";
                            ws_tool.centeredModelShow(text,src);
                        }
                    }
                    break;
                case "websocket_code_018":
                    if(result.status==200){
                        console.log("websocket_code_018."+server_error+","+server_close);
                        if(server_error==false && server_close==true){
                            ws_tool.login_status();

                            $('#modalSignin').modal('hide');
                            $('#centeredModalToggle').modal('hide');
                            $('#loading-modal').modal('show');

                            $('#loading-text-span').text("Connecting, please wait...");
                            let interval=setInterval(function(){
                                clearInterval(interval);
                                ws_tool.websocket_handler(reqest_data,true,call_back);
                            },1000);
                        }
                    }
                    break;
                case "websocket_code_019":
                    if(result.status==200){

                    }else  if(result.status==209){
                        var parseMessage=JSON.parse(result.data.message);
                        ws_tool.login_status();

                        $('#modalSignin').modal('hide');
                        $('#centeredModalToggle').modal('show');
                        let text=parseMessage.err+" 👉 "+parseMessage.login_account;
                        let src="../img/admin-settings-male-root.png";
                        ws_tool.centeredModelShow(text,src);
                    }
                    break;
                default :
                    break;
            }
        });
    }

    centeredModelShowURL(text,src,url){
        $('#centered-text-span').text(text);
        $("#centered-img").attr("src",src);
        $("#centered-confirm-btn").unbind("click");
        $("#centered-confirm-btn").click(function(e){
            $("#centered-confirm-btn").unbind("click");
            $('#centeredModalToggle').modal('hide');
            $('#modalSignin').modal('show');
            window.open(url,"_blank");
        });
    }

    centeredModelShowReload(text,src){
        $('#centered-text-span').text(text);
        $("#centered-img").attr("src",src);
        $("#centered-confirm-btn").unbind("click");
        $("#centered-confirm-btn").click(function(e){
            $("#centered-confirm-btn").unbind("click");
            $('#centeredModalToggle').modal('hide');
             location.reload();
        });
    }

    centeredModelShow(text,src){
        $('#centered-text-span').text(text);
        $("#centered-img").attr("src",src);
        $("#centered-confirm-btn").unbind("click");
        $("#centered-confirm-btn").click(function(e){
            $("#centered-confirm-btn").unbind("click");
            $('#loading-modal').modal('hide');
            $('#centeredModalToggle').modal('hide');
            $('#modalSignin').modal('show');
        });
    }

    login_status(){
        $("#index-login-button").removeClass("disabled");
        $("#index-login-span").removeClass("visually-hidden");
        $("#index-login-icon").addClass("visually-hidden");
        $("#index-login-loading").addClass("visually-hidden");
    }
    create_connect(string_socket_data,call_back){
        if(window.WebSocket){
            ws = new WebSocket(ifct.socket_server_js());
            ws.onopen = function(e) {
                ws.send(string_socket_data);
            }
            ws.onmessage = function(e){
                let socketResult=JSON.parse(e.data);
                server_error=false;
                server_close=false;
                call_back(socketResult);
            }
            ws.onerror = function(){
                console.log("Server communication error "+server_error);
                server_error=true;
                call_back({"status":200,"data":{"message":"disconnect from server"},"trans_code":"websocket_code_017"});
            }
            ws.onclose = function(e){
                console.log("Server disconnected "+server_close);
                server_close=true;
                call_back({"status":200,"data":{"message":"Server communication error, automatic reconnection"},"trans_code":"websocket_code_018"});
            }
        }
    }

    isEmpty(s){
        if(s==null || s==undefined || s=="undefined" || s=="null"){
            return true;
        }else{
            let rpl_s=String(s).replace(/\s+/g,"");
            if(rpl_s!="" && rpl_s.length>0){
                return false;
            }
        }
        return true;
    }

    showNotifySuccessRight(message){
       $.notify("<img src='./img/3_2.gif' width='30'/> "+ message, {className:"success",autoHideDelay: 4500,position:"top right"});
    }

    showNotifySuccessLeft(message){
       $.notify("<img src='./img/3_2.gif' width='30'/> "+ message, {className:"success",autoHideDelay: 4500,position:"top left"});
    }

    showNotifyWarnRight(message){
        $.notify("<img src='./img/1_2.gif' width='30'/> "+ message, {className:"warn",autoHideDelay: 4500,position:"top right"});
    }

	clean() {

	}

    formatDate(fmt,date){
        fmt = arguments[0] || "yyyy-MM-dd hh:mm:ss";
        date = arguments[1] || new Date();
        let o={
            "M+":date.getMonth()+1,
            "d+":date.getDate(),
            "h+":date.getHours(),
            "m+":date.getMinutes(),
            "s+":date.getSeconds(),
            "q+":Math.floor((date.getMonth()+3)/3),
            "S":date.getMilliseconds()
        };
        if(/(y+)/.test(fmt)){
            fmt=fmt.replace(RegExp.$1,(date.getFullYear()+"").substr(4-RegExp.$1.length));
        }
        for(let k in o){
            if(new RegExp("(" + k + ")").test(fmt)){
                fmt=fmt.replace(RegExp.$1,(RegExp.$1.length==1)?(o[k]):(("00"+o[k]).substr((""+o[k]).length)));
            }
        }
        return fmt;
    }

    parseQueryString(queryString) {
        var keyValuePairs = queryString.split('&');
        var result = {};
        keyValuePairs.forEach(function(keyValuePair) {
            var parts = keyValuePair.split('=');
            var key = decodeURIComponent(parts[0]);
            var value = decodeURIComponent(parts[1] || '');
            result[key] = value;
        });
        return result;
    }
}

export const ws_tool = new WebsocketTool();
