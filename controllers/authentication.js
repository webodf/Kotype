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

/*jslint nomen: true, unparam: true*/
/*global require, process, console, module*/
var passport = require("passport"),
    mongoose = require("mongoose"),
    GithubStrategy = require("passport-github").Strategy,
    GoogleStrategy = require("passport-google-oauth").OAuth2Strategy,
//     FacebookStrategy = require("passport-facebook").Strategy,
//     TwitterStrategy = require('passport-twitter').Strategy,
    LocalStrategy = require("passport-local").Strategy,
    RColor = require("./RColor"),
    uuid = require("node-uuid"),
    multiparty = require("multiparty");

passport.serializeUser(function (user, done) {
    "use strict";
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    "use strict";
    done(null, obj);
});

function flashMessages(req, messages) {
    "use strict";
    messages.forEach(function (message) {
        req.flash("info", message.msg);
    });
}

// TODO: duplicated from router.js
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

function useStrategies(expressServer, objectCache, config, version) {
    "use strict";
    var User = mongoose.model("User"),
        Document = mongoose.model("Document"),
        urlPathPrefix = config.urlPathPrefix || "",
        defaultAvatarUrlPath = urlPathPrefix + "/images/default-avatar.png",
        allowsignup = config.allowSignup === true,
        authservices = configuredAuthServiceData(config),
        randomColor = new RColor();

    function isBlockedByWhiteList(loginName, serviceIdentity) {
        var serviceWhitelist = config.whitelist && config.whitelist[serviceIdentity];

        return serviceWhitelist &&
            (!serviceWhitelist.hasOwnProperty(loginName)
             || serviceWhitelist[loginName] !== true);
    }

    function handleServiceLoginCallback(req, userData, done, serviceIdentity) {
        var username = serviceIdentity + "." + userData.id;
console.log(userData);
        if (isBlockedByWhiteList(userData.id, serviceIdentity)) {
            return done(null, false, req.flash("info", "You are not in the whitelist."));
        }

        // check if user is already registered
        User.findOne({ username: username }, function (err, user) {
            if (err) {
                return done(err);
            }
            if (user) {
                if (user.identity !== serviceIdentity) {
                    return done(null, false, req.flash("info", "A different user with the same username already exists."));
                }

                return done(null, user);
            }
            // register as new user TODO: namespace username by service, so usernames cannot clash?
            var newUser = new User({
                username: username,
                name: userData.name,
                avatar_url: userData.avatar_url,
                color: randomColor.get(true, 0.7),
                identity: serviceIdentity
            });
            newUser.save(function (err) {
                if (err) {
                    console.log(err);
                } else {
                    return done(null, newUser);
                }
            });
        });
    }

    if (config.auth && config.auth.github) {
        passport.use(new GithubStrategy(
            {
                clientID: config.auth.github.clientID,
                clientSecret: config.auth.github.clientSecret,
                callbackURL: "https://" + config.auth.callbackHost + ":" + config.auth.callbackPort + urlPathPrefix + "/auth/github/callback",
                passReqToCallback: true
            },
            function (req, accessToken, refreshToken, profile, done) {
                process.nextTick(function () {
                    var userData = {
                        id: profile._json.login,
                        name: profile._json.name,
                        avatar_url: profile._json.avatar_url
                    };
                    handleServiceLoginCallback(req, userData, done, "github");
                });
            }
        ));
    }

    if (config.auth && config.auth.google) {
        passport.use(new GoogleStrategy({
                clientID: config.auth.google.clientID,
                clientSecret: config.auth.google.clientSecret,
                callbackURL: "https://" + config.auth.callbackHost + ":" + config.auth.callbackPort + urlPathPrefix + "/auth/google/callback",
                scope: ['https://www.googleapis.com/auth/userinfo.profile'],
                passReqToCallback: true
            },
            function(req, accessToken, refreshToken, profile, done) {
                process.nextTick(function () {
                    var userData = {
                        id: profile._json.id,
                        name: profile._json.name,
                        avatar_url: profile._json.picture
                    };
                    handleServiceLoginCallback(req, userData, done, "google");
                });
            }
        ));
    }
/*
    passport.use(new FacebookStrategy({
            clientID: config.auth.facebook.clientID,
            clientSecret: config.auth.facebook.clientSecret,
            callbackURL: "https://" + config.auth.callbackHost + ":" + config.auth.callbackPort + urlPathPrefix + "/auth/facebook/callback",
            passReqToCallback: true
        },
        function(req, accessToken, refreshToken, profile, done) {
console.log(profile);
return;
            process.nextTick(function () {
                handleServiceLoginCallback(req, profile, done, "facebook");
            });
        }
    ));

    passport.use(new TwitterStrategy({
            clientID: config.auth.twitter.clientID,
            clientSecret: config.auth.twitter.clientSecret,
            callbackURL: "https://" + config.auth.callbackHost + ":" + config.auth.callbackPort + urlPathPrefix + "/auth/twitter/callback",
            passReqToCallback: true
        },
        function(req, accessToken, refreshToken, profile, done) {
console.log(profile);
return;
            process.nextTick(function () {
                handleServiceLoginCallback(req, profile, done, "twitter");
            });
        }
    ));
*/

    passport.use("local", new LocalStrategy(
        {
            passReqToCallback: true
        },
        function (req, username, password, done) {
            if (isBlockedByWhiteList(username, "local")) {
                return done(null, false, req.flash("info", "You are not in the whitelist."));
            }

            User.findOne({ username: "local." + username }, function (err, user) {
                if (err) { return done(err); }
                if (!user) {
                    return done(null, false, req.flash("info", "Incorrect username."));
                }
                if (user.identity !== "local") {
                    return done(null, false, req.flash("info", "A different user with the same username already exists."));
                }
                user.checkPassword(password, function (err, isMatch) {
                    if (err) { return done(err); }
                    if (isMatch) {
                        return done(null, user);
                    } else {
                        return done(null, false, req.flash("info", "Incorrect password."));
                    }
                });
            });
        }
    ));

    passport.use("guest", new LocalStrategy(
        {
            passReqToCallback: true
        },
        function (req, username, password, done) {
            User.findOne({ username: "guest." + username }, function (err, user) {
                if (err) { return done(err); }
                if (!user) {
                    return done(null, false, req.flash("info", "Incorrect username."));
                }
                if (user.identity !== "guest") {
                    return done(null, false, req.flash("info", "A different guest with the same username already exists."));
                }
                return done(null, user);
            });
        }
    ));


    function restrictDocumentToLoggedInOrGuest(req, res, next) {
        if (req.isAuthenticated() && req.user.identity !== "guest") {
            return next();
        }

        function authenticateGuest(username) {
            req.body.username = username;
            req.body.password = "dummypassword";
            passport.authenticate("guest", function (err, user, info) {
                if (err) {
                    return next(err);
                }
                if (!user) {
                    return res.redirect(urlPathPrefix + '/login');
                }
                req.logIn(user, function (err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null);
                });
            })(req, res, next);
        }

        var documentId = req.params.id;
        Document.findById(documentId, function (err, doc) {
            if (err) {
                return next(err);
            }
            if (!doc) {
                return next(new Error("No such document"));
            }
            if (!doc.isPublic) {
                res.redirect(urlPathPrefix + '/');
                return;
            }

            doc = objectCache.getTrackedObject(doc);

            // so it's a public doc, and the guest is already authenticated?
            if (req.isAuthenticated()) {
                return next();
            }

            // Not yet authenticated
            // Create a guest user and authenticate
            var guestid = uuid.v1(),
                newGuest = new User({
                username: "guest." + guestid,
                name: "Unknown Author",
                avatar_url: defaultAvatarUrlPath,
                color: randomColor.get(true, 0.7),
                identity: "guest"
            });
            newGuest.save(function (err) {
                if (err) {
                    return next(err);
                }
                authenticateGuest(guestid);
            });
        });
    }

    this.restrictDocumentToLoggedInOrGuest = restrictDocumentToLoggedInOrGuest;

    expressServer.use(passport.initialize());
    expressServer.use(passport.session());

    /*jslint emptyblock: true*/
    expressServer.get(urlPathPrefix + '/auth/github', passport.authenticate('github'), function (req, res) {});
    expressServer.get(urlPathPrefix + '/auth/facebook', passport.authenticate('facebook'), function (req, res) {});
    expressServer.get(urlPathPrefix + '/auth/google', passport.authenticate('google'), function (req, res) {});
    /*jslint emptyblock: false*/
    expressServer.get(urlPathPrefix + '/auth/github/callback', passport.authenticate('github', {
        successRedirect: urlPathPrefix + '/',
        failureRedirect: urlPathPrefix + '/login',
        failureFlash: true
    }));
    expressServer.get(urlPathPrefix + '/auth/facebook/callback', passport.authenticate('facebook', {
        successRedirect: urlPathPrefix + '/',
        failureRedirect: urlPathPrefix + '/login',
        failureFlash: true
    }));
    expressServer.get(urlPathPrefix + '/auth/google/callback', passport.authenticate('google', {
        successRedirect: urlPathPrefix + '/',
        failureRedirect: urlPathPrefix + '/login',
        failureFlash: true
    }));
    expressServer.get(urlPathPrefix + '/auth/twitter/callback', passport.authenticate('twitter', {
        successRedirect: urlPathPrefix + '/',
        failureRedirect: urlPathPrefix + '/login',
        failureFlash: true
    }));
    expressServer.post(urlPathPrefix + '/login', passport.authenticate('local', {
        successRedirect: urlPathPrefix + '/',
        failureRedirect: urlPathPrefix + '/login',
        failureFlash: true
    }));

    if (config.allowSignup === true) {
    expressServer.post(urlPathPrefix + '/signup', function (req, res) {
        var form = new multiparty.Form({
                autoFiles: true,
                maxFilesSize: 1024 * 1024 * 5,
                uploadDir: config.cacheRoot
            });

        form.parse(req, function (err, fields, files) {
            var username,
                name,
                password,
                password_repeated,
                avatar,
                avatarPath,
                errorsToFlash;

            if (err) {
                req.flash("info", "Could not create account: " + err);
                // TODO: instead of this and the other render calls this should redirect to router
                // and login page should start with signup form
                // TODO: all req.flash in this method should be done the same way
                res.render("login", {
                    urlPathPrefix: urlPathPrefix,
                    version: version,
                    authservices: authservices,
                    allowsignup: allowsignup,
                    messages: req.flash("info")
                });
            } else {
                username = fields.username && fields.username[0];
                name = fields.name && fields.name[0];
                password = fields.password && fields.password[0];
                password_repeated = fields.password_repeated && fields.password_repeated[0];
                avatar = files.avatar && files.avatar[0];

                if (!username) { req.flash("info", "You must specify a username."); }
                if (!name) { req.flash("info", "You must specify a name."); }
                if (!password) { req.flash("info", "You must specify a password."); }
                if (!password_repeated) {
                    req.flash("info", "You must enter your password twice.");
                } else if (password !== password_repeated) {
                    req.flash("info", "The two passwords must match.");
                }

                if (isBlockedByWhiteList(username)) {
                    req.flash("info", "You are not in the whitelist.");
                }

                errorsToFlash = req.flash("info");
                if (errorsToFlash.length > 0) {
                    res.render("login", {
                        urlPathPrefix: urlPathPrefix,
                        version: version,
                        authservices: authservices,
                        allowsignup: allowsignup,
                        messages: errorsToFlash
                    });
                } else {
                    if (avatar && ["image/png", "image/jpeg"].indexOf(avatar.headers["content-type"]) !== -1) {
                        avatarPath = urlPathPrefix + "/cache/" + avatar.path.split('/').pop();
                    }

                    User.findOne({ username: "local." + username }, function (err, user) {
                        if (err) { console.log(err); res.write(err); return; }
                        if (user) {
                            flashMessages(req, [{ msg: "That username already exists." }]);
                            res.render('login', {
                                urlPathPrefix: urlPathPrefix,
                                version: version,
                                authservices: authservices,
                                allowsignup: allowsignup,
                                messages: req.flash('info')
                            });
                        } else {
                            var newUser = new User({
                                username: "local." + username,
                                name: name,
                                password: password,
                                avatar_url: avatarPath || defaultAvatarUrlPath,
                                color: randomColor.get(true, 0.7),
                                identity: "local"
                            });
                            newUser.save(function (err) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    // Specifically set these on the req body
                                    // because bodyParser cannot parse these in a multipart
                                    // request.
                                    req.body.username = username;
                                    req.body.password = password;
                                    passport.authenticate('local', {
                                        successRedirect: urlPathPrefix + '/',
                                        failureRedirect: urlPathPrefix + '/login',
                                        failureFlash: true
                                    })(req, res);
                                }
                            });
                        }
                    });
                }
            }
        });
    });
    }
}

module.exports.useStrategies = useStrategies;
module.exports.restrictDocumentToLoggedInOrGuest = useStrategies.restrictDocumentToLoggedInOrGuest;
