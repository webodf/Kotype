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

/*global require*/
var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    DocumentSchema = new Schema({
        path: { type: String, required: true, unique: true },
        name: { type: String, default: "" },
        originalFileName: { type: String },
        date: { type: String, required: true },
        operations: { type: Array, default: [] },
        editors: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
        isPublic: { type: Boolean, default: false }
    });

mongoose.model("Document", DocumentSchema);
