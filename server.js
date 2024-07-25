/**
 * Created by wangminrui2022 on 2024-06-20.
 */
var express = require("express");
var app = express();
var fs = require("fs");
var path = require("path");
var bodyParser = require("body-parser");

var ifaceServer = require("./nodejs/iface_server.js");
var redisHandle = require("./nodejs/redis_handle.js");

var absolute_path=path.join(__dirname, "/");

var httpServ = require("http");

app.use(express.static(path.join(__dirname, "nodejs")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var redis_client=redisHandle.getClient(ifaceServer.redis_ip(),ifaceServer.redis_port(),ifaceServer.redis_password());
redisHandle.initClient();

app.get("/", function (req, res) {
    setHeader(res,"GET");
    console.log("server.js.app.get()="+req.headers.host+","+req.url);
    let host = req.headers.host.replace(/\:\d+$/,":443");
    console.log("host:"+host);
    let position = ifaceServer.server_js().indexOf("cmdmax.com");
    console.log(position);
    if (position !== -1) {
        res.redirect(307,ifaceServer.server_http_js()+ifaceServer.onlineUserLen());
    }else{
        res.redirect(307,ifaceServer.server_http_js()+":"+ifaceServer.http_port()+ifaceServer.onlineUserLen());
    }
    console.log(req.query);
});

app.get(ifaceServer.onlineUserLen(), function (req, res) {
    setHeader(res,"GET");
    if(redis_client.connected==false || redis_client.ready==false){
        console.log("redis service is not connected");
    }else{
        redis_client.get("onlineUserLen",function(e_1,d_1) {
            if (e_1 == null) {
                let onlineUserLen=0;
                if(d_1!=null){
                    onlineUserLen=d_1;
                }else{

                }
                res.type("json");
                res.status(200);
                res.json({"onlineUserLen":onlineUserLen});
            }else{
                console.log(e_1);
            }
        });
    }
});

function setHeader(res,Methods) {
    res.setHeader("Access-Control-Allow-Origin",ifaceServer.server_http_js());
    res.setHeader("Access-Control-Allow-Origin",ifaceServer.server_http_js());
    res.setHeader("Access-Control-Allow-Methods", Methods);
    res.setHeader("Access-Control-Max-Age", "3600");
    res.setHeader("Access-Control-Allow-Headers", "x-requested-with,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
}

httpServ.createServer(app).listen(ifaceServer.http_port());

console.log("node server.js");
console.log("node .\\ComfyUI\\server.js");
console.log("Server");
console.log("https listen="+ifaceServer.http_port());