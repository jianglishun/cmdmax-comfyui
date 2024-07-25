/**
 * Created by wangminrui2022 on 2024-06-20.
 */
var express = require("express");
var app = express();
var fs = require("fs");
var path = require("path");
var bodyParser = require("body-parser");

var ifaceServer = require("./nodejs/iface_server.js");
var commonUtil = require("./nodejs/common_util.js");
var serverSettingsHandle = require("./nodejs/server_settings_handle.js");
var redisHandle = require("./nodejs/redis_handle.js");

var absolute_path=path.join(__dirname, "/");


var httpServ = require("http");
var WebSocketServer = require("ws").Server;

app.use(express.static(path.join(__dirname, "nodejs")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var redis_client=redisHandle.getClient(ifaceServer.redis_ip(),ifaceServer.redis_port(),ifaceServer.redis_password());
redisHandle.initClient();

serverSettingsHandle.init(absolute_path);

var processRequest = function(req,res){
    res.writeHead(200);
    res.end("\n");
};

var appServer = httpServ.createServer(processRequest).listen(ifaceServer.socket_port());
var connectUserManagerList=new Array();
var socket_server = new WebSocketServer({server: appServer});

socket_server.on("connection",function (connect) {

    connect.on("message",function (message){
        onMessageProcess(connect,message);
    });
    connect.on("close", function (code, reason) {
        console.log("close the connection");
        checkConnectUserManagerStatus();
    });
    connect.on("error", function (code, reason) {
        console.log("bad connection");
        checkConnectUserManagerStatus();
    });
});

function addUserManagerToList(userManager){
    connectUserManagerList.push(userManager);
    updateRedis();
}

function updateConnectUserManagerData(userManager){
    let len=connectUserManagerList.length;
    for(let i=0;i<len;i++){
        if(connectUserManagerList[i].login_account==userManager.login_account){
            connectUserManagerList[i].login_account=userManager.login_account;
            connectUserManagerList[i].uuid=userManager.uuid;
            break;
        }
    }
    updateRedis();
}

function checkConnectUserManagerStatus(){
    let len=connectUserManagerList.length;
    console.log("checkConnectUserManagerStatus() total number of users "+len);
    for(let i=0;i<len;i++){
        let um=connectUserManagerList[i];
        if(um!=null &&
            um.connect!=null &&
            um.connect!=undefined  &&
            um.connect.readyState>1){
            connectUserManagerList.splice(i,1);
            len--;
            break;
        }
    }
    updateRedis();
}

function getConnectUserManager(connectUserManagerList,login_account){
    let len=connectUserManagerList.length;
    for(let i=0;i<len;i++){
        let um=connectUserManagerList[i];
        if(um.login_account==login_account){
            return um;
        }
    }
    return null;
}

function updateRedis(){
    if(redis_client.connected==false || redis_client.ready==false){
        console.log("redis service is not connected");
    }else{
        redis_client.del("onlineUserLen",function(e_2,d_2){
            if(e_2==null){
                let onlineUserLen=connectUserManagerList.length;
                redis_client.set("onlineUserLen",onlineUserLen,function(e_1,d_1){
                    if(e_1==null && d_1=="OK"){
                         console.log("addUserManagerToList() Number of remaining users "+onlineUserLen);
                    }else{
                         console.log(e_1);
                    }
                });
            }else{
                 console.log(e_2);
            }
        });
    }
}

function onMessageProcess(connect,message){
    let parseMessage=null;
    try{
        parseMessage=JSON.parse(message);
    }catch(err){
        console.log("onMessageProcess()"+err);
        message.close();
    }
    if(parseMessage != undefined){
    
        switch(parseMessage.trans_code){
            case "websocket_code_001":
                    let userManager=parseMessage.data;
                    let serverCurrentInfo=serverSettingsHandle.getServerCurrentInfo();
                    let onlineUserLen=connectUserManagerList.length;
                    if(serverCurrentInfo!=null && onlineUserLen<serverCurrentInfo.max_users){
                        updateConnectUserManagerData(userManager);
                        let sendConnectUserManager=getConnectUserManager(connectUserManagerList,userManager.login_account);
                        if(sendConnectUserManager!=null){
                            let sendData={"err":"Repeated login with the same account","login_account":userManager.login_account};
                            let socketData=getSocketData(209,sendData,"websocket_code_019");
                            sendOne(connect,socketData,function (r_5){
                                console.log("onMessageProcess() websocket_code_019 209 "+JSON.stringify(sendData));
                                sendData={"remoteAddress":connect._socket.remoteAddress};
                                socketData=getSocketData(200,sendData ,"websocket_code_004");
                                sendOne(sendConnectUserManager.connect,socketData,function (r_6){
                                    console.log("onMessageProcess() websocket_code_004 "+JSON.stringify(sendData));
                                });
                            });
                        }else{
                            let currentUserManager=JSON.parse(JSON.stringify(userManager));
                            currentUserManager.connect=connect
                            addUserManagerToList(currentUserManager);

                            let socketData=getSocketData(200, {
                                    "message":"Welcome to CMDMAX ComfyUI,Number of people currently online:",
                                    "online":onlineUserLen},
                                    "websocket_code_001");
                            //console.log("socketData");console.log(socketData);
                            sendOne(currentUserManager.connect,socketData,function (r_4){
                                console.log("onMessageProcess() websocket_code_001 ["+currentUserManager.login_account+
                                    "] The connection is successful, and a message is sent to the user "+
                                    JSON.stringify(socketData));
                            });
                        }
                    }else{
                        let serverHost=serverSettingsHandle.getActivateServer();
                        let responseStatus=205;
                        if(commonUtil.isEmpty(serverHost)){
                            responseStatus=206;
                        }
                        let currentUserManager=JSON.parse(JSON.stringify(userManager));
                        currentUserManager.connect=connect;

                        let socketData=getSocketData(responseStatus, {
                                "message":"The current number of online users on the server is full.",
                                "online":onlineUserLen,
                                "h":serverSettingsHandle.getActivateServer()},
                                "websocket_code_001");
                        console.log("socketData");console.log(socketData);
                        sendOne(currentUserManager.connect,socketData,function (r_7){
                            console.log("onMessageProcess() websocket_code_001 "+JSON.stringify(socketData));
                            currentUserManager=null;
                        });
                    }
                break;
                case "websocket_code_019":
                    userManager=parseMessage.data;
                    console.log("userManager");console.log(userManager);
                    updateConnectUserManagerData(userManager);
                break;
            default :
                console.log("onMessageProcess() Bad request, close directly");
                connect.close();
                break;
        }
    }

}

function sendOne(connect,socketData,call_back){
    connect.send(socketData,function (err){
        if(err==null){
            commonUtil.resultCallBack(200,"SUCCESS",call_back);
        }else{
            console.log("sendOne"+err);
           commonUtil.resultCallBack(300,err,call_back);
        }
    });
}

function getSocketData(status,message,trans_code){
    let socketData={"status":status,"data":{"message":JSON.stringify(message)},"trans_code":trans_code};
    return JSON.stringify(socketData);
}

console.log("node socket_server.js");
console.log("node .\\ComfyUI\\socket_server.js");
console.log("Socket Server");
console.log("https listen="+ifaceServer.socket_port());
