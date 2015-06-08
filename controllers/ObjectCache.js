/*
 * Copyright (C) 2015 KO GmbH <copyright@kogmbh.com>
 *
 * @licstart
 * This file is part of Kotype.
 *
 * Kotype is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License (GNU AGPL)
 * as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * Kotype is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Kotype.  If not, see <http://www.gnu.org/licenses/>.
 * @licend
 *
 * @source: https://github.com/kogmbh/Kotype/
 */

/*jslint nomen: true, unparam: true */
/*global require, console, setInterval, module */
var mongoose = require("mongoose"),
    async = require("async"),
    ObjectCache;

// Maintains an in-memory cache of objects from mongoose collections,
// and writes them to the DB periodically.

var ObjectCache = function () {
    "use strict";

    var objects = {},
        timer,
        writeInterval = 1000 * 5;

    function isTracked(object) {
        return objects.hasOwnProperty(object._id);
    }
    this.isTracked = isTracked;

    function getTrackedObject(object) {
        var id = object._id;

        if (!objects[id]) {
            objects[id] = object;
        }

        return objects[id];
    }
    this.getTrackedObject = getTrackedObject;

    function forgetTrackedObject(object) {
        var id = object._id;

        if (objects.hasOwnProperty(id)) {
            delete objects[id];
        }
    }
    this.forgetTrackedObject = forgetTrackedObject;

    function saveObjects(callback) {
        async.each(Object.keys(objects), function (id, cb) {
            if (objects[id].isModified()) {
                objects[id].save(cb);
            } else {
                cb();
            }
        }, callback);
    }

    this.destroy = function (callback) {
        clearInterval(timer);
        saveObjects(callback);
    };

    function init() {
        timer = setInterval(function () {
            saveObjects();
        }, writeInterval);
    }

    init();
};

module.exports = ObjectCache;
