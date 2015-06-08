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

/*jslint unparam: true, nomen: true*/
/*global require, console, module, Buffer*/
var multiparty = require("multiparty"),
    mongoose = require("mongoose"),
    clone = require("clone"),
    authentication = require("./authentication"),
    Utils = require("./Utils"),
    Document,
    Template,
    utils,
    version,
    onlySingleTemplate,
    allowUpload,
    allowsignup,
    authservices,
    uploadDir,
    conversionHost,
    urlPathPrefix,
    objectCache;

/**
 * Renders the home page with templates and documents if the
 * user is logged in, otherwise renders the default index page.
 */
function showHomePage(req, res) {
    "use strict";
    if (req.user) {
        Document.find({}, null, {
            sort: {
                date: "desc"
            }
        }).exec(function (err, documents) {
            Template.find({}, function (err, templates) {
                var slimDocuments = documents.map(function (doc) {
                    var slimDoc;

                    if (objectCache.isTracked(doc)) {
                        slimDoc = JSON.parse(JSON.stringify(objectCache.getTrackedObject(doc)));
                    } else {
                        slimDoc = JSON.parse(JSON.stringify(doc));
                    }

                    slimDoc.operations.length = 0;
                    return slimDoc;
                });

                Document.populate(slimDocuments, "editors",
                    function (err, populatedDocs) {
                        res.render('index', {
                            urlPathPrefix: urlPathPrefix,
                            version: version,
                            onlySingleTemplate: onlySingleTemplate,
                            allowUpload: allowUpload,
                            templates: templates,
                            documents: populatedDocs,
                            user: req.user
                        });
                    }
                );
            });
        });
    } else {
        res.redirect(urlPathPrefix + '/login');
    }
}

/**
 * Renders the login page if the user is not logged in,
 * flashing any messages.
 */
function showLoginPage(req, res) {
    "use strict";
    if (req.isAuthenticated() && req.user.identity !== "guest") {
        res.redirect(urlPathPrefix + '/');
    } else {
        res.render('login', {
            urlPathPrefix: urlPathPrefix,
            version: version,
            authservices: authservices,
            allowsignup: allowsignup,
            messages: req.flash('info')
        });
    }
}

/**
 * Renders the editor page with the document specified in
 * the request.
 */
function showEditor(req, res) {
    "use strict";
    var documentId = req.params.id;
    Document.findById(documentId, function (err, document) {
        if (err) {
            console.log(err);
            res.status(500).redirect(urlPathPrefix + '/');
            return;
        }
        if (!document) {
            res.status(404).redirect(urlPathPrefix + '/');
            return;
        }

        document = objectCache.getTrackedObject(document);
        res.render('editor', {
            urlPathPrefix: urlPathPrefix,
            version: version,
            document: document,
            user: req.user,
            conversionHost: conversionHost
        });
    });
}

/**
 * Logs out the user from the session, then redirects to
 * the home page.
 */
function logout(req, res) {
    "use strict";
    if (req.user) {
        req.logout();
    }
    res.redirect(urlPathPrefix + '/');
}

/**
 * Middleware to restrict the request to only logged-in users.
 * Users that are not logged in are redirected to the login page.
 */
function restrict(req, res, next) {
    "use strict";
    if (req.isAuthenticated() && req.user.identity !== "guest") {
        return next();
    }
    res.redirect(urlPathPrefix + '/login');
}

/*
 * Handles file uploads. If ODT files are received, they are saved into
 * the /documents directory, and then enlisted into the database.
 * FIXME: This should really block bad filetypes from uploading.
 */
function handleFileUpload(req, res) {
    "use strict";
    var form = new multiparty.Form({
        autoFiles: true,
        maxFilesSize: 1024 * 1024 * 100,
        uploadDir: uploadDir
    });

    form.parse(req);
    form.on("file", function (name, file) {
        var filename;
        if (utils.checkODTFile(file.path)) {
            filename = file.path.split('/').pop();
            utils.createDocument("/documents/" + filename, file.path, file.originalFilename, function (err, documentId) {
                if (err) { console.log(err); res.status(500).redirect(urlPathPrefix + '/'); } else {
                    console.log("New document " + file.originalFilename + " created with filename " + filename);
                }
            });
        } else {
            console.log("Bad file type encountered, not adding to database.");
        }
    });
    form.on("close", function () {
        res.redirect(urlPathPrefix + "/");
    });
    // TODO: temporary workaround, still need to find why there is an error when run with a nginx proxy
    // catch any errors, will be otherwise thrown as exception, so would crash the server
    form.on("error", function (err) {
        console.log("Form error: "+ err.toString());
    });
}


function configuredAuthServiceData(config) {
    var services = [];

    if (config.auth) {
        if (config.auth.github) {
            services.push({id: "github", displayName: "GitHub"});
        }
        if (config.auth.github) {
            services.push({id: "google", displayName: "Google"});
        }
    }

    return services;
}

/**
 * Attaches the routes to the express server.
 */
function attach(expressServer, objCache, config, v) {
    "use strict";
    Template = mongoose.model("Template");
    Document = mongoose.model("Document");
    utils = new Utils(config, objCache);

    objectCache = objCache;
    urlPathPrefix = config.urlPathPrefix || "",
    uploadDir = config.documentsRoot;
    conversionHost = config.conversionHost;
    onlySingleTemplate = config.onlySingleTemplate === true; // TODO: ensure there is at least one template
    allowUpload = config.allowUpload === true,
    allowsignup = config.allowSignup === true;
    authservices = configuredAuthServiceData(config);
    version = v; // TODO: find if there is a more general way to make server version available to renderer

    expressServer.get(urlPathPrefix + '/', restrict, showHomePage);
    expressServer.get(urlPathPrefix + '/login', showLoginPage);
    expressServer.get(urlPathPrefix + '/logout', logout);

    // Only respond with the editor to authenticated requests
    expressServer.get(urlPathPrefix + '/document/:id', authentication.restrictDocumentToLoggedInOrGuest, showEditor);
    // Only let authenticad requests create documents from templates
    expressServer.get(urlPathPrefix + '/template/:id/create', restrict, function (req, res) {
        var templateId = req.params.id;

        // Use the same name as the template for creating a document from it
        Template.findById(templateId, function (err, template) {
            if (err) {
                console.log(err);
                res.status(500).redirect(urlPathPrefix + '/');
                return;
            }
            if (!template) {
                console.log('Null template');
                res.status(500).redirect(urlPathPrefix + '/');
                return;
            }

            utils.createDocumentFromTemplate(template, function (err, documentId) {
                if (err) {
                    console.log(err);
                    res.status(500).redirect(urlPathPrefix + '/');
                    return;
                }
                res.redirect(urlPathPrefix + '/document/' + documentId);
            });
        });
    });


    if (allowUpload) {
        // Only allow authenticated file upload requests
        expressServer.post(urlPathPrefix + '/upload', restrict, handleFileUpload);
    }
}

module.exports.attach = attach;
