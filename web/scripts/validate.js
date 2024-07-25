import { api } from "./api.js"
import { ws_tool } from "./websocket_tool.js"

export class Validate {
	constructor() {
	    console.log("validate.js");
	}
    start(){
        $.busyLoadFull("hide");
        val.login_validate();
    }

    login_validate(){
       let session_user=sessionStorage.getItem("CMDMAX_ComfyUI_USER")
       if(val.isEmpty(session_user)==true){
           $('#modalSignin').modal('show');
       }else{
           $('#modalSignin').modal('hide');
           let session_user=sessionStorage.getItem("CMDMAX_ComfyUI_USER");
           session_user=JSON.parse(session_user);
           let request_data={
                "data":{"login_account":session_user.login_account,"password":session_user.password,"uuid":"925ce0df-e847-b84a-faac-5a538ee47ebf"},
                "trans_code":"websocket_code_001",
                "hash": "Y1HqxtjvifLuM1GF01GU7EcqqGDlH3mjSo+AIPmnnMbEucb4kdtv0DXv4c9xy4WhQiicCfJdN80P9A"};
           ws_tool.websocket_handler(request_data,false,function(result){
                if(result.status==200) {
                    let parseData = result.data;
                    val.showNotifySuccessRight(parseData.message + " " + parseData.online + " Once logged in, you can start using it. " + val.formatDate());
                }else{
                    val.showNotifyWarnRight(result.err);
                }
           });
       }

       const forms = document.querySelectorAll('.needs-validation')
          Array.from(forms).forEach(function(form){
            form.addEventListener('submit', function(event) {
              if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
                form.classList.add('was-validated');
              }else{
                    event.preventDefault();
                    event.stopPropagation();
                    form.classList.add('was-validated');
                    $("#index-login-button").addClass("disabled");
                    $("#index-login-span").addClass("visually-hidden");
                    $("#index-login-icon").removeClass("visually-hidden");
                    $("#index-login-loading").removeClass("visually-hidden");
                    let interval=setInterval(function(){
                        clearInterval(interval);
                        let param_login_account=$("#floatingLoginAccount").val();
                        let param_password=$("#floatingPassword").val();
                        val.validatePrompt(param_login_account,param_password,function(result){
                            console.log("validatePrompt");
                            console.log(result);
                             result.then(function(data){
                                if(data.status==200){
                                    let request_data={
                                        "data":{"login_account":param_login_account,"password":param_password,"uuid":"925ce0df-e847-b84a-faac-5a538ee47ebf"},
                                        "trans_code":"websocket_code_001",
                                        "hash": "Y1HqxtjvifLuM1GF01GU7EcqqGDlH3mjSo+AIPmnnMbEucb4kdtv0DXv4c9xy4WhQiicCfJdN80P9A"};
                                    ws_tool.websocket_handler(request_data,false,function(result){
                                        let session_user=JSON.stringify(data);
                                        sessionStorage.removeItem("CMDMAX_ComfyUI_USER");
                                        sessionStorage.setItem("CMDMAX_ComfyUI_USER",session_user);
                                        if(result.status==200) {
                                            let parseData = result.data;
                                            val.showNotifySuccessRight(parseData.message + " " + parseData.online + " Once logged in, you can start using it. " + val.formatDate());
                                        }else{
                                            val.showNotifyWarnRight(result.err);
                                        }
                                    });
                                }else if(data.status==201){
                                    $("#floatingPassword").addClass("is-invalid");
                                    $("#floatingPassword-invalid-feedback").text("The password is incorrect");
                                    ws_tool.login_status();
                                }else if(data.status==202){
                                    $("#floatingLoginAccount").addClass("is-invalid");
                                    $("#floatingLoginAccount-invalid-feedback").text("The account does not exist");
                                    ws_tool.login_status();
                                }
                             },function(error){
                                console.log(error);
                             });
                        });
                    },500);
              }
            }, false)
        });

        $("#floatingLoginAccount").on("change", function() {
            $("#floatingLoginAccount").removeClass("is-invalid");
            $("#floatingLoginAccount-invalid-feedback").text("Please fill in this field");
        });
        $("#floatingPassword").on("change", function() {
            $("#floatingPassword").removeClass("is-invalid");
            $("#floatingPassword-invalid-feedback").text("Please fill in this field");
        });

        let signIpWithSCSIM=$('#sign-up-with-SCSIM')[0];
        signIpWithSCSIM.addEventListener('click',function(event){
            window.open("https://cmdmax.co", "_blank");
        });

        let termsOfUse=$('#terms-of-use')[0];
        termsOfUse.addEventListener('click',function(event){
            val.copyright();
        });

        let privacyPolicy=$('#privacy-policy')[0];
        privacyPolicy.addEventListener('click',function(event){
            let htmlobj=$.ajax({url:"./license/PrivacyPolicy",async:false});
            $("#modalFullscreen").modal('show');
            $("#modalFullscreenLabel").empty();
            $("#modalFullscreenLabel").append("CMDMAX Privacy Policy");
            $("#full-screen-modal-body").empty();
            $("#full-screen-modal-body").append(htmlobj.responseText);
        });

        let GUNLicense=$('#gun-license')[0];
        GUNLicense.addEventListener('click',function(event){
            let htmlobj=$.ajax({url:"./license/GNU-License",async:false});
            $("#modalFullscreen").modal('show');
            $("#modalFullscreenLabel").empty();
            $("#modalFullscreenLabel").append("GNU General Public License v3.0");
            $("#full-screen-modal-body").empty();
            $("#full-screen-modal-body").append(htmlobj.responseText);
        });

        $("#chrome_browser").click(function(e){
            window.open("https://www.google.com/intl/en_us/chrome/", "_blank");
        });
        $("#edge_browser").click(function(e){
            window.open("https://www.microsoft.com/zh-cn/edge/download?form=MA13FJ", "_blank");
        });
    }
    copyright(){
        let htmlobj=$.ajax({url:"./license/CMDmax",async:false});
        $("#modalFullscreen").modal('show');
        $("#modalFullscreenLabel").empty();
        $("#modalFullscreenLabel").append("Copyright © 2020 CMDMAX Technology Incorporated and its licensors And Terms of Use");
        $("#full-screen-modal-body").empty();
        $("#full-screen-modal-body").append(htmlobj.responseText);
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

     validatePrompt(param_login_account, param_password,call_back) {
        const body = {
            login_account: param_login_account,
            password: param_password
        };

        const res = api.fetchApi("/validate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

         res.then(function(data){
            return call_back(data.json());
         },function(error){
            console.log(error);
         });
    }

	fetchApi(route, options) {
		return fetch(this.apiURL(route), options);
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

export const val = new Validate();
