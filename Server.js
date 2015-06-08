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
/*global require, __dirname, console, module*/
var express = require("express"),
    expressSession = require("express-session"),
    compression = require("compression"),
    expressValidator = require("express-validator"),
    cookieParser = require("cookie-parser"),
    bodyParser = require("body-parser"),
    flash = require("connect-flash"),
    MongoStore = require("connect-mongo")(expressSession),
    templatingEngine = require("ejs-locals"),
    mongoose = require("mongoose"),
    socketio = require("socket.io"),
    passportSocketIo = require("passport.socketio"),
    https = require("https"),
    http = require("http"), // TODO: only require https or http, what is the best pattern to depend this on the config?
    fs = require("fs"),
    version = require("./package.json").version,
    Server;

Server = function (config) {
    "use strict";
    var httpServer,
        socketServer,
        serverAdaptor,
        expressServer,
        sessionStore,
        objectCache,
        sockets = [];

    function populateTemplates() {
        var files = fs.readdirSync(__dirname + '/' + config.templatesRoot),
            Template = mongoose.model("Template");

        Template.remove({}, function () {
            files.forEach(function (templateName) {
                var title;
                if (templateName.split('.').pop() === 'odt') {
                    title = templateName.slice(0, -4);
                    Template.findOne({
                        name: title
                    }, function (err, template) {
                        if (err) { console.log(err); } else {
                            if (!template) {
                                var newTemplate = new Template({
                                    name: title,
                                    path: __dirname + '/' + config.templatesRoot + '/' + templateName
                                });
                                newTemplate.save(function (err) {
                                    if (err) { console.log(err); }
                                });
                            }
                        }
                    });
                }
            });
        });
    }

    this.destroy = function (cb) {
        serverAdaptor.destroy(function () {
            console.log("All realtime clients disconnected.");
            objectCache.destroy(function () {
                console.log("All data persisted.");
                httpServer.close(function () {
                    console.log('HTTP server shut down.');
                    mongoose.disconnect(function () {
                        console.log("DB connection closed.");
                        console.log("Everything successfully shut down. Bye!");
                        cb();
                    });
                });

                sockets.forEach(function (socket) {
                    socket.destroy();
                });
            });
        });
    };

    function init() {
        require("./models/User");
        require("./models/Document");
        require("./models/Template");

        var router = require("./controllers/router"),
            authentication = require("./controllers/authentication"),
            ServerAdaptor = require("./controllers/ServerAdaptor"),
            ObjectCache = require("./controllers/ObjectCache"),
            urlPathPrefix = config.urlPathPrefix || "",
            sslOptions,
            cookieParserInstance = cookieParser(config.cookieSecret),
            dbUri = "mongodb://" + config.mongodbHost + ":" + config.mongodbPort + "/" + config.mongodbName,
            oneDay = 86400000;

        // Connect to MongoDB
        mongoose.connect(dbUri);

        expressServer = express();
        sessionStore = new MongoStore({
            host: config.mongodbHost,
            port: config.mongodbPort,
            db: config.mongodbName
        }, function () {
            objectCache = new ObjectCache();
            // Config:
            // Set a 'port' key for the express server, for future reference
            expressServer.set("port", config.port);
            // Use ejs as our templating engine, with template views in /views
            expressServer.engine("ejs", templatingEngine);
            expressServer.set("view options", __dirname + "/views");
            expressServer.set("view engine", "ejs");

            // Middleware:
            // Use various parsers
            expressServer.use(cookieParserInstance);
            expressServer.use(bodyParser.json());
            expressServer.use(bodyParser.urlencoded({
                extended: true
            }));
            // Use a form validator middleware
            expressServer.use(expressValidator());
            // Use a helper to signal messages using HTTP flashing
            expressServer.use(flash());
            // Use session capabilities along with the default Memory Store
            expressServer.use(expressSession({
                store: sessionStore,
                key: "express.sid"
            }));
            // Attach PassportJS strategies as middleware
            authentication.useStrategies(expressServer, objectCache, config, version);

            expressServer.use(compression());
            // Resolve general static requests by looking under public/
            expressServer.use(urlPathPrefix + "/", express.static(__dirname + "/public"));
            // Use a special prefix for the closure library
            expressServer.use(urlPathPrefix + "/closure", express.static(__dirname + "/bower_components/closurelibrary/closure/goog", { maxAge: oneDay }));
            // Use a special /dependencies prefix for other simpler libraries
            expressServer.use(urlPathPrefix + "/dependencies", express.static(__dirname + "/bower_components", { maxAge: oneDay }));
            // The editorRoot points to the directory with the compiled Wodo editor
            expressServer.use(urlPathPrefix + "/editor", express.static(__dirname + "/" + config.editorRoot, { maxAge: oneDay }));
            // The resourceRoot contains editor resources, such as fonts
            expressServer.use(urlPathPrefix + "/resources", express.static(__dirname + "/" + config.resourceRoot, { maxAge: oneDay }));
            // The templatesRoot contains template ODT documents from which new ones may be created
            expressServer.use(urlPathPrefix + "/templates", express.static(__dirname + "/" + config.templatesRoot));
            // The documentsRoot is where uploaded/created documents are automatically placed
            expressServer.use(urlPathPrefix + "/documents", express.static(__dirname + "/" + config.documentsRoot, { maxAge: oneDay }));
            // The cacheRoot is where miscellaneous items like avatar images are cached
            expressServer.use(urlPathPrefix + "/cache", express.static(__dirname + "/" + config.cacheRoot, { maxAge: oneDay }));

            expressServer.all('*', function (req, res, next) {
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Headers", "X-Requested-With");
                next();
            });

            // Enlist all templates found in the templatesRoot into the database
            populateTemplates();

            if (config.ssl) {
                // Equip SSL information
                sslOptions = {
                    key: fs.readFileSync(config.ssl.key),
                    cert: fs.readFileSync(config.ssl.cert)
                };
                // Create the HTTP server and attach it to express
                httpServer = https.createServer(sslOptions, expressServer);
            } else {
                // Create the HTTP server and attach it to express
                httpServer = http.createServer(expressServer);
            }
            // Register SocketIO server as a listener
            socketServer = socketio(httpServer, { path: urlPathPrefix + '/socket.io'});
            // SocketIO must use the same authorization as the express server
            socketServer.use(passportSocketIo.authorize({
                cookieParser: cookieParser,
                key: "express.sid",
                secret: config.cookieSecret,
                store: sessionStore,
                success: function (data, accept) {
                    console.log("Connection authorized to socket.io.");
                    accept(null, true);
                },
                fail: function (data, message, error, accept) {
                    console.log("Failed connection to socket.io: " + message);
                    accept(null, false);
                }
            }));

            httpServer.on('connection', function (socket) {
                sockets.push(socket);
                socket.on('close', function () {
                    sockets.splice(sockets.indexOf(socket), 1);
                });
            });

            // Start listening at the configured port
            httpServer.listen(config.port, config.hostname, function () {
                console.log("Server is running on port " + config.port + " for hostname " + config.hostname);
                router.attach(expressServer, objectCache, config, version);
                serverAdaptor = new ServerAdaptor(socketServer, objectCache);
                if (!serverAdaptor) {
                    console.log("No serverAdaptor");
                }
            });
        });
    }

    init();
};

module.exports = Server;
