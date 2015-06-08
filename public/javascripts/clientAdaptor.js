/*jslint unparam: true*/
/*global runtime, core, ops, location, io*/

var ClientAdaptor = (function() {
    "use strict";

var OperationRouter = function (socket, odfContainer, errorCb) {
    var EVENT_BEFORESAVETOFILE = "beforeSaveToFile",
        EVENT_SAVEDTOFILE = "savedToFile",
        EVENT_HASLOCALUNSYNCEDOPERATIONSCHANGED = "hasLocalUnsyncedOperationsChanged",
        EVENT_HASSESSIONHOSTCONNECTIONCHANGED =   "hasSessionHostConnectionChanged",
        EVENT_MEMBERADDED = "memberAdded",
        EVENT_MEMBERCHANGED = "memberChanged",
        EVENT_MEMBERREMOVED = "memberRemoved",
        eventNotifier = new core.EventNotifier([
            EVENT_BEFORESAVETOFILE,
            EVENT_SAVEDTOFILE,
            EVENT_HASLOCALUNSYNCEDOPERATIONSCHANGED,
            EVENT_HASSESSIONHOSTCONNECTIONCHANGED,
            EVENT_MEMBERADDED,
            EVENT_MEMBERCHANGED,
            EVENT_MEMBERREMOVED,
            ops.OperationRouter.signalProcessingBatchStart,
            ops.OperationRouter.signalProcessingBatchEnd
        ]),

        operationFactory,
        playbackFunction,

        lastServerSyncHeadId = 0,
        sendClientOpspecsLock = false,
        sendClientOpspecsTask,
        hasSessionHostConnection = true,
        unplayedServerOpSpecQueue = [],
        unsyncedClientOpSpecQueue = [],
        operationTransformer = new ops.OperationTransformer(),

        /**@const*/sendClientOpspecsDelay = 300;


    function playbackOpspecs(opspecs) {
        var op, i;

        if (!opspecs.length) {
            return;
        }

        eventNotifier.emit(ops.OperationRouter.signalProcessingBatchStart, {});
        for (i = 0; i < opspecs.length; i += 1) {
            op = operationFactory.create(opspecs[i]);
            if (op !== null) {
                if (!playbackFunction(op)) {
                    eventNotifier.emit(ops.OperationRouter.signalProcessingBatchEnd, {});
                    errorCb("opExecutionFailure");
                    return;
                }
            } else {
                eventNotifier.emit(ops.OperationRouter.signalProcessingBatchEnd, {});
                errorCb("Unknown opspec: " + runtime.toJson(opspecs[i]));
                return;
            }
        }
        eventNotifier.emit(ops.OperationRouter.signalProcessingBatchEnd, {});
    }

    function handleNewServerOpsWithUnsyncedClientOps(serverOps) {
        var transformResult = operationTransformer.transform(unsyncedClientOpSpecQueue, serverOps);

        if (!transformResult) {
            errorCb("Has unresolvable conflict.");
            return false;
        }

        unsyncedClientOpSpecQueue = transformResult.opSpecsA;
        unplayedServerOpSpecQueue = unplayedServerOpSpecQueue.concat(transformResult.opSpecsB);

        return true;
    }

    function handleNewClientOpsWithUnplayedServerOps(clientOps) {
        var transformResult = operationTransformer.transform(clientOps, unplayedServerOpSpecQueue);

        if (!transformResult) {
            errorCb("Has unresolvable conflict.");
            return false;
        }

        unsyncedClientOpSpecQueue = unsyncedClientOpSpecQueue.concat(transformResult.opSpecsA);
        unplayedServerOpSpecQueue = transformResult.opSpecsB;

        return true;
    }

    function receiveServerOpspecs(headId, serverOpspecs) {
        if (unsyncedClientOpSpecQueue.length > 0) {
            handleNewServerOpsWithUnsyncedClientOps(serverOpspecs);
            // could happen that ops from server make client ops obsolete
            if (unsyncedClientOpSpecQueue.length === 0) {
                eventNotifier.emit(EVENT_HASLOCALUNSYNCEDOPERATIONSCHANGED, false);
            }
        } else {
            // apply directly
            playbackOpspecs(serverOpspecs);
        }
        lastServerSyncHeadId = headId;
    }

    function sendClientOpspecs() {
        var originalUnsyncedLength = unsyncedClientOpSpecQueue.length;

        if (originalUnsyncedLength) {
            sendClientOpspecsLock = true;

            socket.emit("commit_ops", {
                head: lastServerSyncHeadId,
                ops: unsyncedClientOpSpecQueue
            }, function (response) {
                if (response.conflict === true) {
                    sendClientOpspecs();
                } else {
                    lastServerSyncHeadId = response.head;
                    // on success no other server ops should have sneaked in meanwhile, so no need to check
                    // got no other client ops meanwhile?
                    if (unsyncedClientOpSpecQueue.length === originalUnsyncedLength) {
                        unsyncedClientOpSpecQueue.length = 0;
                        // finally apply all server ops collected while waiting for sync
                        playbackOpspecs(unplayedServerOpSpecQueue);
                        unplayedServerOpSpecQueue.length = 0;
                        eventNotifier.emit(EVENT_HASLOCALUNSYNCEDOPERATIONSCHANGED, false);
                        sendClientOpspecsLock = false;
                    } else {
                        // send off the new client ops directly
                        unsyncedClientOpSpecQueue.splice(0, originalUnsyncedLength);
                        sendClientOpspecs();
                    }
                }
            });
        }
    }

    this.setOperationFactory = function (f) {
        operationFactory = f;
    };

    this.setPlaybackFunction = function (f) {
        playbackFunction = f;
    };

    this.push = function (operations) {
        var clientOpspecs = [],
            now = Date.now(),
            hasLocalUnsyncedOpsBefore = (unsyncedClientOpSpecQueue.length !== 0),
            hasLocalUnsyncedOpsNow;

        operations.forEach(function(op) {
            var opspec = op.spec();

            opspec.timestamp = now;
            clientOpspecs.push(opspec);
        });

        playbackOpspecs(clientOpspecs);

        if (unplayedServerOpSpecQueue.length > 0) {
            handleNewClientOpsWithUnplayedServerOps(clientOpspecs);
        } else {
            unsyncedClientOpSpecQueue = unsyncedClientOpSpecQueue.concat(clientOpspecs);
        }

        hasLocalUnsyncedOpsNow = (unsyncedClientOpSpecQueue.length !== 0);
        if (hasLocalUnsyncedOpsNow !== hasLocalUnsyncedOpsBefore) {
            eventNotifier.emit(EVENT_HASLOCALUNSYNCEDOPERATIONSCHANGED, hasLocalUnsyncedOpsNow);
        }

        sendClientOpspecsTask.trigger();
    };

    this.requestReplay = function (cb) {
        var cbOnce = function () {
            eventNotifier.unsubscribe(ops.OperationRouter.signalProcessingBatchEnd, cbOnce);
            cb();
        };
        // hack: relies on at least addmember op being added for ourselves and being executed
        eventNotifier.subscribe(ops.OperationRouter.signalProcessingBatchEnd, cbOnce);
        socket.emit("replay", {});
    };

    this.close = function (cb) {
        cb();
    };

    this.subscribe = function (eventId, cb) {
        eventNotifier.subscribe(eventId, cb);
    };

    this.unsubscribe = function (eventId, cb) {
        eventNotifier.unsubscribe(eventId, cb);
    };

    this.hasLocalUnsyncedOps = function () {
        return unsyncedClientOpSpecQueue.length !== 0;
    };

    this.hasSessionHostConnection = function () {
        return hasSessionHostConnection;
    };

    function init() {
        sendClientOpspecsTask = core.Task.createTimeoutTask(function () {
            if (!sendClientOpspecsLock) {
                sendClientOpspecs();
            }
        }, sendClientOpspecsDelay);

        socket.on("replay", function (data) {
            receiveServerOpspecs(data.head, data.ops);

            socket.on("new_ops", function (data) {
                receiveServerOpspecs(data.head, data.ops);
            });
        });
    }
    init();
};

var ClientAdaptor = function (documentId, documentURL, urlPathPrefix, connectedCb, kickedCb, disconnectedCb) {
    var memberId,
        socket;

    this.getMemberId = function () {
        return memberId;
    };

    this.getGenesisUrl = function () {
        return documentURL;
    };

    this.createOperationRouter = function (odfContainer, errorCb) {
        runtime.assert(Boolean(memberId), "You must be connected to a session before creating an operation router");
        return new OperationRouter(socket, odfContainer, errorCb);
    };

    this.joinSession = function (cb) {
        socket.on("join_success", function handleJoinSuccess(data) {
            socket.removeListener("join_success", handleJoinSuccess);
            memberId = data.memberId;
            cb(memberId);
        });
        socket.emit("join", {
            documentId: documentId
        });
    };

    this.leaveSession = function (cb) {
        socket.emit("leave", {}, cb);

        socket.removeAllListeners();
    };

    this.getSocket = function () {
        return socket;
    };

    function init() {
        socket = io({
            path: urlPathPrefix + '/socket.io',
            forceNew: true
        });
        socket.on("connect", connectedCb);
        socket.on("kick", kickedCb);
        socket.on("disconnect", disconnectedCb);
    }
    init();
};

return ClientAdaptor;

}());
