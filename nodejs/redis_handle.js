/**
 * Created by wangminrui2022 on 2024-05-19.
 */
var redis = require("redis");
var redis_client=null;

exports.getClient=function(ip,port,password){
    if(redis_client==null){
        console.log("create redis client");
        let options={"password":password};
        redis_client=redis.createClient(port,ip,options);
    }else{
        console.log("get redis client");
    }
    return redis_client;
}

exports.initClient=function (){
    redis_client.on("ready", function() {
        console.log(redis_client.connected);
        console.log(redis_client.address);
        console.log(redis_client.connect_timeout);
        console.log(redis_client.connection_options);
        console.log(redis_client.connection_id);
        console.log(redis_client.connected);
        console.log(redis_client.ready);
    });
    redis_client.on("connect", function() {
        console.log("redis connect:"+redis_client.connected);
    });
    redis_client.on("reconnecting", function() {
        console.log("redis reconnecting:"+redis_client.connected);
    });
    redis_client.on("error", function(error) {
        console.log("redis error:"+error+","+redis_client.connected);
    });
    redis_client.on("end", function() {
        console.log("redis end");
    });
    redis_client.on("warning", function() {
        console.log("redis warning");
    });
}