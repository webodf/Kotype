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

var async = require("async");

var Room = function (document, documentId) {
    var hasCursor = {},
        sockets = [],
        serverSeq = 0;

    function trackTitle(ops) {
        var newTitle, i;

        for (i = 0; i < ops.length; i += 1) {
            if (ops[i].optype === "UpdateMetadata" && ops[i].setProperties["dc:title"] !== undefined) {
                newTitle = ops[i].setProperties["dc:title"];
            }
        }

        if (newTitle !== undefined) {
            if (newTitle.length === 0) {
                newTitle = "Untitled Document";
            }
        }

        if (newTitle) {
            document.name = newTitle;
        }
    }

    function trackEditors() {
        // TODO: rather track by ops, to decouple from socket implementation
        sockets.forEach(function (socket) {
            var _id = socket.request.user._id;
            if (document.editors.indexOf(_id) === -1) {
                document.editors.push(_id);
            }
        });
    }

    function trackCursors(ops) {
        var i;

        for (i = 0; i < ops.length; i += 1) {
            if (ops[i].optype === "AddCursor") {
                hasCursor[ops[i].memberid] = true;
            }
            if (ops[i].optype === "RemoveCursor") {
                hasCursor[ops[i].memberid] = false;
            }
        }
    }

    function sanitizeDocument() {
        var ops = document.operations,
            unbalancedCursors = {},
            unbalancedMembers = {},
            lastAccessDate = document.date,
            newOps = [],
            i;

        for (i = 0; i < ops.length; i += 1) {
            if (ops[i].optype === "AddCursor") {
                unbalancedCursors[ops[i].memberid] = true;
            } else if (ops[i].optype === "RemoveCursor") {
                unbalancedCursors[ops[i].memberid] = false;
            } else if (ops[i].optype === "AddMember") {
                unbalancedMembers[ops[i].memberid] = true;
            } else if (ops[i].optype === "RemoveMember") {
                unbalancedMembers[ops[i].memberid] = false;
            }
        }

        Object.keys(unbalancedCursors).forEach(function (memberId) {
            if (unbalancedCursors[memberId]) {
                newOps.push({
                    optype: "RemoveCursor",
                    memberid: memberId,
                    timestamp: lastAccessDate
                });
            }
        });

        Object.keys(unbalancedMembers).forEach(function (memberId) {
            if (unbalancedMembers[memberId]) {
                newOps.push({
                    optype: "RemoveMember",
                    memberid: memberId,
                    timestamp: lastAccessDate
                });
            }
        });

        if (newOps.length) {
            // Update op stack
            document.operations = document.operations.concat(newOps);
            serverSeq = document.operations.length;
        }
    }

    function broadcastMessage(message, data) {
        sockets.forEach(function (peerSocket) {
            peerSocket.emit(message, data)
        });
    }

    function sendOpsToMember(socket, ops) {
        socket.emit("new_ops", {
            head: serverSeq,
            ops: ops
        });
    }

    function replayOpsToMember(socket) {
        socket.emit("replay", {
            head: serverSeq,
            ops: document.operations
        });
    }

    function broadcastOpsByMember(socket, ops) {
        if (!ops.length) {
            return;
        }
        sockets.forEach(function (peerSocket) {
            if (peerSocket !== socket) {
                sendOpsToMember(peerSocket, ops);
            }
        });
    }

    function writeOpsToDocument(ops, cb) {
        if (!ops.length) {
            cb();
        }

        trackTitle(ops);
        trackEditors();

        // Update op stack
        document.operations = document.operations.concat(ops);
        serverSeq = document.operations.length;

        // Update modified date
        document.date = new Date();

        cb();
    }

    function addMember(user, cb) {
        var memberId,
            op,
            timestamp = Date.now();

        memberId = user.username + "_" + documentId + "_" + timestamp.toString();

        op = {
            optype: "AddMember",
            memberid: memberId,
            timestamp: timestamp,
            setProperties: {
                fullName: user.name,
                color: user.color,
                imageUrl: user.avatar_url
            }
        };
        writeOpsToDocument([op], function () {
            cb(memberId, [op]);
        });
    }

    function removeMember(memberId, cb) {
        var ops = [],
            timestamp = Date.now();

        if (hasCursor[memberId]) {
            ops.push({
                optype: "RemoveCursor",
                memberid: memberId,
                timestamp: timestamp
            });
        }
        ops.push({
            optype: "RemoveMember",
            memberid: memberId,
            timestamp: timestamp
        });
        writeOpsToDocument(ops, function () {
            cb(ops);
        });
    }

    function getOpsAfter(basedOn) {
        return document.operations.slice(basedOn, serverSeq);
    }

    this.socketCount = function () {
        return sockets.length;
    };

    this.attachSocket = function (socket) {
        // Add the socket to the room and give the
        // client it's unique memberId
        addMember(socket.request.user, function (memberId, ops) {
            socket.memberId = memberId;
            sockets.push(socket);

            broadcastOpsByMember(socket, ops);

            socket.emit("join_success", {
                memberId: memberId
            });
            // Service replay requests
            socket.on("replay", function () {
                replayOpsToMember(socket);
            });
            // Store, analyze, and broadcast incoming commits
            socket.on("commit_ops", function (data, cb) {
                var clientSeq = data.head,
                    ops = data.ops;
                if (clientSeq === serverSeq) {
                    writeOpsToDocument(ops, function () {
                        cb({
                            conflict: false,
                            head: serverSeq
                        });
                        trackCursors(ops);
                        broadcastOpsByMember(socket, data.ops);
                    });
                } else {
                    cb({
                        conflict: true
                    });
                }
            });

            // Service various requests
            socket.on("access_get", function (data, cb) {
                cb({
                    access: document.isPublic ? "public" : "normal"
                });
            });

            if (socket.request.user.identity !== "guest") {
                socket.on("access_change", function (data) {
                    document.isPublic = data.access === "public";
                    broadcastMessage("access_changed", {
                        access: data.access === "public" ? "public" : "normal"
                    });
                    if (data.access !== "public") {
                        sockets.forEach(function (peerSocket) {
                            if (peerSocket.request.user.identity === "guest") {
                                console.log(peerSocket.request.user.name);
                                removeSocket(peerSocket);
                            }
                        });
                    }
                });
            }

            // Handle dropout events
            socket.on("leave", function () {
                removeSocket(socket);
            });
            socket.on("disconnect", function () {
                removeSocket(socket);
            });
        });
    };

    function detachSocket(socket, callback) {
        removeMember(socket.memberId, function (ops) {
            broadcastOpsByMember(socket, ops);

            socket.removeAllListeners();

            function lastCB() {
                socket.removeAllListeners();
                if (callback) {
                    callback();
                }
            }
            // If a socket that is already connected is being
            // removed, this means that this is a deliberate
            // kicking-out, and not a natural event that could
            // result in a reconnection later. Therefore, clean
            // up.
            if (socket.connected) {
                console.log(socket.request.user.name + " is connected, removing");
                socket.on('disconnect', lastCB);
                socket.emit("kick");
                socket.emit("disconnect");
            } else {
                console.log(socket.request.user.name + " is not connected, removing");
                lastCB();
            }
        });
    }

    function removeSocket(socket) {
        var index = sockets.indexOf(socket);

        detachSocket(socket);

        if (index !== -1) {
            sockets.splice(index, 1);
        }
    }

    this.getDocument = function () {
        return document;
    };

    this.destroy = function (callback) {
        async.each(sockets, function (socket, cb) {
            detachSocket(socket, cb);
        }, function () {
            sockets.length = 0;
            callback();
        });
    };

    function init() {
        // Sanitize leftovers from previous session, if any
        sanitizeDocument();
    }

    init();
};

module.exports = Room;
