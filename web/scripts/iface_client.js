/**
 * Created by wangminrui2022 on 2024-03-20.
 */
import { api } from "./api.js"

export class IfaceClient {

	constructor() {
	    console.log("iface_client.js");
	}
    VERSION(){
        return "V1.1020.2355"
    }

    server_js(){return "http://192.168.8.226:47134";}
    server_http_js(){return "http://192.168.8.226:37134";}
    socket_server_js(){return "ws://192.168.8.226:29046";}
}

export const ifct = new IfaceClient();
