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
var bcrypt = require('bcrypt'),
    SALT_WORK_FACTOR = 10,
    mongoose = require('mongoose'),
    UserSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        name: String,
        color: String,
        avatar_url: String,
        password: String,
        identity: { type: String, required: true }
    });

// Before saving a user, if the password has been modified,
// salt and hash it.
UserSchema.pre('save', function (next) {
    "use strict";
    var user = this;

    if (!user.isModified('password')) {
        return next();
    }

    bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
        if (err) { return next(err); }

        bcrypt.hash(user.password, salt, function (err, hash) {
            if (err) { return next(err); }

            user.password = hash;
            next();
        });
    });
});

UserSchema.methods.checkPassword = function (candidatePassword, cb) {
    "use strict";
    bcrypt.compare(candidatePassword, this.password, function (err, isMatch) {
        if (err) { return cb(err); }
        cb(null, isMatch);
    });
};

mongoose.model("User", UserSchema);
