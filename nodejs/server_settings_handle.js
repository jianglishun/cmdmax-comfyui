/**
 * Created by wangminrui2022 on 2024-05-19.
 */

var fs = require("fs");
var ini = require("ini");
var os = require("os");

var ifaceServer = require("./iface_server.js");
var commonUtil = require("./common_util.js");
var requestHandle = require("./request_handle.js");

var serverSettingsIni=null;
var serverCurrentIP=[];
var serverInfoList=[];
var serverCurrentInfo=null;

function init(absolute_path){
    readServerSettingsIni(absolute_path,function (result){
        let parseData=JSON.parse(result)[0];
        if(parseData.status=200){
            serverSettingsIni=parseData.data;
            getServerCurrentIP();
            setServerInfoList();
            startServerStatusDetection();
        }else{
            console.log(parseData.status+","+parseData.err);
        }
    });
}

function setServerInfoList(){
    let parseServerName=JSON.parse(serverSettingsIni.list.server_name);
    let serverNameArray=parseServerName["server_name"];
    for(let i=0;i<serverNameArray.length;i++){
        let ai_server=serverNameArray[i];
        let serverInfo=serverSettingsIni.settings[String(ai_server)];
        let parseServerInfo=JSON.parse(serverInfo);
        serverInfoList.push(parseServerInfo);
        for(let j=0;j<serverCurrentIP.length;j++){
            if(parseServerInfo.ip==serverCurrentIP[j]){
                serverCurrentInfo=parseServerInfo;
            }
        }
    }
}

function getServerCurrentIP(){
    var networkInterfaces = os.networkInterfaces();
    const platform = os.platform();
    if (platform === "win32") {
        for (var interfaceName in networkInterfaces) {
          if (networkInterfaces.hasOwnProperty(interfaceName)) {
            var interfaces = networkInterfaces[interfaceName];
            for (var i = 0; i < interfaces.length; i++) {
                var iface = interfaces[i];
              if (iface.family === "IPv4" && !iface.internal) {
                serverCurrentIP.push(iface.address);
              }
            }
          }
        }
    } else if (platform === "linux") {
        for (let interfaceName in networkInterfaces) {
          console.log("network interface name:", interfaceName);
            if(commonUtil.isEmpty(interfaceName)==false){
                let localNetwork = networkInterfaces[interfaceName] || networkInterfaces[interfaceName];
                if (localNetwork && localNetwork[0] && localNetwork[0].address) {
                  let localIP = localNetwork[0].address;
                  serverCurrentIP.push(localIP);
                } else {
                  console.log("Unable to obtain LAN IP address");
                }
            }
        }
    } else {
        console.log("The current operating system is neither Windows nor Ubuntu");
    }
}
function startServerStatusDetection(){
    let interval=setInterval(function(){
        clearInterval(interval);
            let dataList=JSON.parse(JSON.stringify(serverInfoList));
            recursionServerStatusDetectionIndex(dataList, function(result) {
                dataList=null;
                startServerStatusDetection();
            })
    },1000);
}

var recursion_server_status_detection_index=0;
function recursionServerStatusDetectionIndex(dataList,call_back){
    if(recursion_server_status_detection_index<dataList.length){
        let currentData=dataList[recursion_server_status_detection_index];
        let requestData={
            "request_ip":currentData.http,
            "request_port":currentData.comfyui_port,
            "request_path":ifaceServer.onlineUserLen(),
            "request_method":"GET"};
        requestHandle.requestServer(requestData,function(result){
            if(result.status==200){
                let parseData=null;
                try {
                    parseData=JSON.parse(result.data);
                } catch (err) {
                    console.error(err);
                }
                if(parseData!=null){
                    const updatedArray = serverInfoList.map(obj => {
                        if (obj.index === currentData.index) {
                            return { ...obj, online_users: parseData.onlineUserLen,status_code: 200 };
                        }
                        return obj;
                    });
                    serverInfoList=updatedArray;
                }
            }else{
                console.log(`${JSON.stringify(requestData)} ${JSON.stringify(result)}`);
            }
            recursion_server_status_detection_index++;
            recursionServerStatusDetectionIndex(dataList,call_back);
        });
    }else{
        recursion_server_status_detection_index=0;
        call_back();
    }
}

function readServerSettingsIni(absolute_path,call_back) {
    let localPath=absolute_path+"nodejs/server_settings.ini";
    fs.readFile(localPath,"utf8",function(err, data){
        let system_settings ="";
        if (err!=null) {
            console.log("readConfigurationIni()"+err);
            commonUtil.resultCallBack(300,err,call_back);
        }else{
            system_settings = ini.parse(data);
           commonUtil.resultCallBack(200,system_settings,call_back);
        }
    });
}

function getServerCurrentInfo(){
    return serverCurrentInfo;
}


function getActivateServer(){
    if(serverCurrentInfo!=null){
         for(let i=0;i<serverInfoList.length;i++){
            let serverInfo=serverInfoList[i];
            if(serverInfo.index!=serverCurrentInfo.index &&
                serverInfo.status_code==200 &&
                serverInfo.online_users<serverInfo.max_users){
                return serverInfo.host;
            }
        }
    }
    return "";
}

exports.init=init
exports.getServerCurrentInfo=getServerCurrentInfo
exports.getActivateServer=getActivateServer