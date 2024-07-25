/**
 * Created by wangminrui2022 on 2024-05-19.
 */
var http = require("http");

function requestServer(data,call_back){
    let params = JSON.stringify(data);
    let options = {
        host: data.request_ip,
        path: data.request_path,
        method: data.request_method,
        headers: {
            "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8",
            "Content-Length":params.length}};

    let httpReq = http.request(options, function(httpRes) {
        httpRes.setEncoding("utf8");
        httpRes.on("data", function (result) {
            call_back({"status":200,"data":result});
        });
        httpRes.on("end", function(){

        });
    });
  
    httpReq.on("error", function(err) {
        call_back({"status":300,"err":err});
    });
    httpReq.write(params + "\n");
    httpReq.end();
}

exports.requestServer=requestServer