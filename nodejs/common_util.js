/**
 * Created by wangminrui2022 on 2024-05-19.
 */

var fs = require("fs");

exports.isEmpty=function(s){
   return isEmpty(s);
}
let isEmpty=function(s){
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

exports.resultCallBack=function(status,result,call_back){
    resultCallBack(status,result,call_back);
}
function resultCallBack(status,result,call_back){
    let str=getResultStr(status,result,null);
    call_back(str);
}

exports.resultCallBackForToken=function(status,result,token,call_back){
    let str=getResultStr(status,result,token);
    call_back(str);
}

exports.getResultStr=function(status,result){
    return getResultStr(status,result,null);
}
let getResultStr=function(status,result,token){
    let obj=new Object();
    obj.status=status;
    if(parseInt(status)>=200 && parseInt(status)<=299){
        obj.data=result;
    }else{
        obj.err=result;
    }
    let res=new Object();
    res[0]=obj;
    res[1]=token;
    let str=JSON.stringify(res);
    return str;
}