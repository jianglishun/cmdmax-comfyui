import os
import sys
import platform
from comfy.typing import Iterable

class LoginValidate(object):

    def __init__(self):
        pass

    def exec_validate(self,login_account,password,gradio_auth_creds):
        if gradio_auth_creds is None:
            return "The account data is empty."
        # print(self.gradio_auth_creds)
        # print(login_account)
        # print(password)
        # print("--------------------")
        status=202 #账号不存在
        for item in gradio_auth_creds:
            # print(item)
            if login_account in item:
                status=201 #密码错误
                if item[1]==password:
                    status=200#验证成功
        # print(status)
        return status

    #print(Iface().getFilePath(""));
    def getFilePath(self,fileName):
        # 当前目录路径
        # print("getcwd:",os.getcwd());
        # print(os.path);
        # print("系统平台：",platform.system().lower());
        appPath=os.path.abspath(sys.argv[0]);
        # print("appPath=",appPath,len(appPath));
        if platform.system().lower()=="windows":
            lastIndex=appPath.rfind("\\");
        elif platform.system().lower()=="linux":
            lastIndex=appPath.rfind("/");
        # print("lastIndex=",lastIndex);
        proDir=appPath[0:lastIndex+1];
        # print("当前目录路径",proDir);
        # 在当前目录路径下查找.ini文件
        filePath = os.path.join(proDir, fileName);
        return  filePath;


    def get_gradio_auth_creds(self,cmd_opts) -> Iterable[tuple[str, ...]]:
        """
        Convert the gradio_auth and gradio_auth_path commandline arguments into
        an iterable of (username, password) tuples.
        """

        def process_credential_line(s) -> tuple[str, ...] | None:
            s = s.strip()
            if not s:
                return None
            return tuple(s.split(':', 1))

        if cmd_opts.gradio_auth:
            for cred in cmd_opts.gradio_auth.split(','):
                cred = process_credential_line(cred)
                if cred:
                    yield cred

        if cmd_opts.gradio_auth_path:
            with open(cmd_opts.gradio_auth_path, 'r', encoding="utf8") as file:
                for line in file.readlines():
                    for cred in line.strip().split(','):
                        cred = process_credential_line(cred)
                        if cred:
                            yield cred
