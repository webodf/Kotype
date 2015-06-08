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

var mongoose = require("mongoose"),
    JSZip = require("jszip"),
    fs = require("fs");

var Utils = function (config, objectCache) {
    "use strict";
    var Document = mongoose.model("Document"),
        uploadDir = config.documentsRoot;

    /**
    * Return true if a number of simple tests on an odt file pass.
    * @param {!string} path
    * @return {!boolean}
    */
    function checkODTFile(path) {
        var fd = fs.openSync(path, 'r'),
            buffer = new Buffer(47);
        fs.readSync(fd, buffer, 0, 47, 30);
        fs.closeSync(fd);
        return buffer.toString() === "mimetypeapplication/vnd.oasis.opendocument.text";
    }
    this.checkODTFile = checkODTFile;

    /**
    * Copies a file asynchronously from the source path to target path.
    */
    function copyFile(source, target, cb) {
        var cbCalled = false,
            rd = fs.createReadStream(source),
            wr = fs.createWriteStream(target);

        function done(err) {
            if (!cbCalled) {
                cb(err);
                cbCalled = true;
            }
        }

        rd.on("error", done);
        wr.on("error", done);
        wr.on("close", function (ex) {
            done();
        });
        rd.pipe(wr);

    }

    /**
     * Gets the title of a document from the stored metadata
     */
    function getTitleFromDocument(path, cb) {
        fs.readFile(path, function(err, data) {
            var zip, metaXmlFile, titleMatch;
            if (err) {
                cb(err);
                return;
            }
            zip = new JSZip(data);
            metaXmlFile = zip.file("meta.xml");
            if (!metaXmlFile) {
                cb("No \"meta.xml\" found, ODT file corrupt?");
                return;
            }
            // TODO: handle strange content like newlines
            titleMatch = /<dc:title>([^]*?)<\/dc:title>/.exec(metaXmlFile.asText());
            cb(null, titleMatch ? titleMatch[1] : "");
        });
    }

    /**
     * Enlists a document at a given path into the database
     */
    function createDocument(urlPath, localPath, originalFilename, cb) {
        var newDoc;

        getTitleFromDocument(localPath, function (err, title) {
            if (err) {
                cb(err);
                return;
            }
            newDoc = new Document({
                path: urlPath,
                name: title,
                originalFileName: originalFilename,
                date: new Date(),
                operations: []
            });
            newDoc.save(function (err) {
                if (err) {
                    cb(err);
                    return;
                }
                newDoc = objectCache.getTrackedObject(newDoc);
                cb(null, newDoc._id);
            });
        });
    }
    this.createDocument = createDocument;

    /**
     * Creates a new document from the given template id with the
     * specified name, inside the public /documents, and then
     * enlists it in the databse.
     */
    this.createDocumentFromTemplate = function (template, cb) {
        var filename = template.name + '_' + Date.now() + '.odt',
            filePath = uploadDir + '/' + filename;

        copyFile(template.path, filePath, function (err) {
            if (err) {
                cb(err);
                return;
            }
            createDocument("/documents/" + filename, filePath, null, function (err, documentId) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log("New document \"" + template.name + "\" created with filename \"" + filename + "\"");
                cb(null, documentId);
            });
        });
    };

    function init() {
    }

    init();
};

module.exports = Utils;
