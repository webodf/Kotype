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
    Room = require("./Room"),
    Document;

// Maintains an in-memory cache of users, documents, and sessions.
// And writes/reads them from the DB on demand.
var ServerAdaptor = function (socketServer, objectCache) {
    "use strict";
    var rooms = {},
        Document = mongoose.model("Document");


    function addToRoom(documentId, socket) {
        var room, document;

        room = rooms[documentId];

        if (!room) {
            Document.findById(documentId, function (err, doc) {
                if (err) {
                    console.log(err);
                    return;
                }
                if (!doc) {
                    console.log("documentId unknown:"+documentId);
                    return;
                }

                // Load document into hot cache
                document = objectCache.getTrackedObject(doc);
                room = new Room(document, documentId);
                rooms[documentId] = room;

                room.attachSocket(socket);
            });
        } else {
            room.attachSocket(socket);
        }
    }

    this.destroy = function (callback) {
        async.each(Object.keys(rooms), function (documentId, cb) {
            rooms[documentId].destroy(cb);
        }, function () {
            rooms = {};
            callback()
        });
    };

    function init() {
        socketServer.on("connection", function (socket) {
            var handshake = socket.handshake,
                user;

            if (!handshake) {
                console.log("No handshake done for this connection");
                return;
            }

            user = socket.request.user;

            if (!user || !socket.request.user.logged_in) {
                console.log("Request is not from an authenticated user.");
                return;
            }

            socket.on("join", function (data) {
                var documentId = data.documentId;
                if (documentId) {
                    console.log("Authorized user " + user.username + " for document " + documentId);
                    addToRoom(documentId, socket);
                } else {
                    console.log("Error: Client did not specify a document ID");
                }
            });
        });
    }

    init();
};
module.exports = ServerAdaptor;
