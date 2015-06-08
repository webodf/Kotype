// Free to use & distribute under the MIT license
// Wes Johnson (@SterlingWes)
//
// inspired by http://martin.ankerl.com/2009/12/09/how-to-create-random-colors-programmatically/

/*global module*/

var RColor = function () {
    "use strict";
    this.hue            = Math.random();
    this.goldenRatio    = 0.618033988749895;
    this.hexwidth       = 2;
};

RColor.prototype.hsvToRgb = function (h, s, v) {
    "use strict";
    var h_i  = Math.floor(h * 6),
        f    = h * 6 - h_i,
        p    = v * (1 - s),
        q    = v * (1 - f * s),
        t    = v * (1 - (1 - f) * s),
        r    = 255,
        g    = 255,
        b    = 255;
    function rgb(rr, gg, bb) {
        r = rr;
        g = gg;
        b = bb;
    }
    switch (h_i) {
    case 0:
        rgb(v, t, p);
        break;
    case 1:
        rgb(q, v, p);
        break;
    case 2:
        rgb(p, v, t);
        break;
    case 3:
        rgb(p, q, v);
        break;
    case 4:
        rgb(t, p, v);
        break;
    case 5:
        rgb(v, p, q);
        break;
    }
    return [Math.floor(r * 256), Math.floor(g * 256), Math.floor(b * 256)];
};

RColor.prototype.padHex = function (str) {
    "use strict";
    if (str.length > this.hexwidth) {
        return str;
    }
    return new Array(this.hexwidth - str.length + 1).join('0') + str;
};

RColor.prototype.get = function (hex, saturation, value) {
    "use strict";
    this.hue += this.goldenRatio;
    this.hue %= 1;
    if (typeof saturation !== "number") {
        saturation = 0.5;
    }
    if (typeof value !== "number") {
        value = 0.95;
    }
    var rgb = this.hsvToRgb(this.hue, saturation, value);
    if (hex) {
        return "#" +  this.padHex(rgb[0].toString(16))
                    + this.padHex(rgb[1].toString(16))
                    + this.padHex(rgb[2].toString(16));
    }
    return rgb;
};

module.exports = RColor;
