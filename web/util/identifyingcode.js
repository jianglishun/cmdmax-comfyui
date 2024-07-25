
var identifyingcode={

    draw:function(canvas) {
        var code="";
        var w=180;
        var h=60;
        var context = canvas.getContext("2d");
        canvas.width = w;
        canvas.height = h;
        context.strokeRect(0, 0, w, h);

        var aCode = "A,B,C,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,W,X,Y,1,2,3,4,5,6,7,8,9";
        var aLength = aCode.split(",").length;
        for (var i = 0; i <= 3; i++) {
            var x = 20 + i * 35;
            var y = 20 + Math.random() * 15;
            var j = Math.floor(Math.random() * aLength);
            var deg = Math.random() * 90 * Math.PI / 180;
            var txt = aCode.split(",")[j];

            code += aCode.split(",")[j];            

            context.fillStyle = identifyingcode.randomRgbColor();   
            context.font = "bold 28px 微软雅黑";    

            context.translate(x, y);
            context.rotate(deg);
            context.fillText(txt, 0, 0);
            context.rotate(-deg);
            context.translate(-x, -y);
        }

        let draw_line=30;
        for (var i = 0; i < draw_line; i++) {
            context.strokeStyle = identifyingcode.randomRgbColor();
            context.beginPath();
            context.moveTo(Math.random() * w, Math.random() * h);
            context.lineTo(Math.random() * w, Math.random() * h);
            context.stroke();
        }

        let draw_point=80;
        for (var i = 0; i < draw_point; i++) {
            context.fillStyle = identifyingcode.randomRgbColor();
            context.beginPath();
            context.arc(Math.random() * w, Math.random() * h, 1, 0, 2 * Math.PI);
            context.fill();
        }
        return code;
    },

    randomRgbColor:function(){
        var r = Math.floor(Math.random() * 256);
        var g = Math.floor(Math.random() * 256);
        var b = Math.floor(Math.random() * 256);
        return "rgb(" + r + "," + g + "," + b + ")";
    }
}