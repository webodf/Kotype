## Kotype

Kotype is a web-based collaborative real-time editing server.

Kotype was funded by [NLnet foundation](https://nlnet.nl/) and developed by [KO GmbH](http://kogmbh.com/).

The Kotype web editor enables authenticated and non-authenticated users to work together in real-time on a (set of) document(s), hosted on a server of their choice. It offers basic formatting of text, as well as annotations. Documents can be exported as ODT or, using an external service like e.g. installable with the [Format Filtering Server](https://github.com/owncloud/format-filter-server), in PDF, DOC, DOCX, and other formats.

Note that not every feature of every office application may be rendered correctly inside the web editor, and certainly not all are editable. That said, unless you deleted parts of the document, everything will show up in the original application without information loss. Kotype is built around the [OpenDocument Format](http://opendocumentformat.org/) standard - so it does not have to import your documents into some internal memory representation. The application natively supports the ODF file format container, and adding new capabilities can be done incrementally.

Kotype uses the `Wodo.CollabTextEditor` component from the [WebODF](http://webodf.org/) project for the web client and `Node.js` and `MongoDB` on the server. For further requirements see the files `package.json` and `bower.json`.

If you miss key features or like what you get with every type of freedom you can possibly imagine - please support Kotype and the WebODF project with your coding skills, donate some money or grab a paid license.


### License

Kotype is a Free Software project. All code is available under the AGPL.


### Installation
Not yet a simple click-and-run process, but will be one day :)

Create a separate folder on your server and enter it:
```
$> mkdir kotype
$> cd kotype
```
Download the [tarball](https://github.com/kogmbh/Kotype/archive/master.zip) with the Kotype sources and unzip it:
```
$> wget https://github.com/kogmbh/Kotype/archive/master.zip
$> unzip master.zip
```
Navigate into the toplevel dir of the unzipped files. There install some dependencies via `npm` and `bower`:
```
$> cd Kotype-master
$> npm install
$> ./node_modules/bower/bin/bower install
```
Prepare some folders that will be used
```
$> cd ..
$> mkdir {cache,documents,resources,templates}
$> mkdir resources/fonts/
$> touch resources/fonts/fonts.css
```
Create a blank ODT file e.g. with LibreOffice and copy it into the `templates` folder (filename can be anything). This file wil be used for new documents.
```
$> cp my/custom/document/template.odt templates/template.odt
```

Download the `Wodo.CollabTextEditor` component (0.5.8 or above, 0.5.8.preview1 available at the time of writing) from http://webodf.org/download:
```
$> cd ..
$> wget http://webodf.org/download/wodocollabtexteditor-0.5.8.preview1.zip
```
(or built yourself from WebODF sources by target `product-wodocollabtexteditor`, see instructions at [GitHub repo of WebODF](http://github.com/kogmbh/WebODF))
We need the complete `wodo` subdirectory from that zip file.
```
$> unzip wodocollabtexteditor-0.5.8.preview1.zip
$> mv wodocollabtexteditor-0.5.8.preview1/wodo .
```


### Configuration

Copy `config.json.template` to `config.json`. And then adjust the settings.
It starts with where kotype server is serving, `hostname` and `port` the interface that is listened on.
```
{
    "hostname": "0.0.0.0",
    "port": "3000",
```
`urlPathPrefix` can be used if Kotype should serve on a subpath of the domain and not directly on the root path.
```
    "urlPathPrefix": "",
```
Next locations where things are found on the filesystem: `editorRoot` points to the path where `Wodo.CollabTextEditor` is found, and `resourceRoot`, `templatesRoot`,`documentsRoot`, and `cacheRoot` to the folders created above.
```
    "editorRoot": "../wodo",
    "resourceRoot": "../resources",
    "templatesRoot": "../templates",
    "documentsRoot": "../documents",
    "cacheRoot": "../cache",
```
It is possible to select from multiple templates (all in the `templatesRoot` folder), for that change `onlySingleTemplate` to `false`.
If you want to limit your users to creating new documents based on your template(s), set `allowUpload` to `false`. Otherwise users can upload their own documents and share and edit these.
```
    "onlySingleTemplate": true,
    "allowUpload": true,
```
Next define where the MongoDB server is found (here using a custom port 31001):
```
    "mongodbHost": "127.0.0.1",
    "mongodbPort": "31001",
    "mongodbName": "kotype",
```
If running a conversionHost, set its url here or set to "":
```
    "conversionHost": "http://127.0.0.1:16080",
```
If you want to run Kotype via `https`, set where the keys and certificates are found, otherwise remove the `ssl` entry from the config, `http` will be used if it does no exist.
```
    "cookieSecret": "varisekrit",
    "ssl": {
        "key": "../ssl/key.pem",
        "cert": "../ssl/cert.pem"
    },
```
Kotype provides its own account system. If users should not be allowed to signup for an account themselves, set to `false`:
```
    "allowSignup": true,
```
Next to its own account system, it is also possible to use OAuth2 authentification to log into Kotype. Tested are GitHub and Google. Please see the sourcefile `controllers/authentication.js` for more.
```
    "auth": {
        "callbackHost": "my.server",
        "callbackPort": "30001",
        "github": {
            "clientID": "yourclientid",
            "clientSecret": "yourclientsecret"
        }
    },
```
To limit who may login and what accounts can be created, some whitelisting exists. `local` is the id fro the own account system of Kotype. If you do not want to whitelist, remove this whole entry from the config or the subentries for the respective account system.
```
    "whitelist": {
        "local": {
            "sueann": true,
            "johndoe": true
        },
        "github": {
            "someid": true
        }
    }
}
```

#### Providing more fonts

Above you have created the folder `resources/fonts` and the file `fonts.css`. 
This folder and this file are used to provide custom fonts to Kotype, as to be offered in the UI for using in the documents.
The font files would be stored in the folder and registered by listing them in `fonts.css`. Each font is registered with a normal `@font-face` CSS rule.


Example:

There is a font with the font-family name "Gentium Basic" in file name `GenBasR.ttf`. The file is placed in `resources/fonts`.
So it will be listed in `fonts.css` as

    @font-face {
        font-family: "Gentium Basic";
        src: url("./GenBasR.ttf") format("truetype");
        font-weight: normal;
        font-style: normal;
    }

### Running Kotype

If you have not already a `mongod` instance running, you might want to start yourself one. E.g. for running a custom instance on your custom port (as configured in Kotype's `config.json`) start
```
$> mongod --dbpath path/to/some/dir/to/be/used/for/db --bind_ip 127.0.0.1 --port 31001
```
Consult your local mongodb experts if this leaves you puzzled.

Now for Kotype to start, in the toplevel directory to kotype call
```
$> node app.js
```
And done finally. Now you should be able to access your Kotype instance on the configured webaddress :)
E.g. if you are running this on your desktop machine and used the preset port, point your browser to https://127.0.0.1:3000/


### Relying on external services

Kotype uses Google's [closurelibrary](https://github.com/google/closure-library) for the UI, currently by relying on it's CDN. Which means clients using Kotype will also
need access to Google's servers. For the future it is planned to change this by having all used content part of the Kotype installation.


### Storage of document sessions

The data of a document is stored in two different places:
the initial document (called "genesis file") is stored in the folder on the filesystem as configured by the `documentsRoot` entry in the `config.json`.
The list of changes done to the document (called "operations") and other metadata is stored in the mongodb, with the schema as defined in `models/Document.js`.

To restore the latest version of a document manually, one would need to take the genesis file and apply all the operations as stored for the document in the mongodb.
Currently there is no simple tool yet available to support that.


### Tips and tricks for users

#### Creating and uploading documents

Users can upload existing documents from the document overview page (located on the main page once you are logged in) or click on Kotype logo at the top left to go there.

Alternatively users can create new documents, based on one or more templates you provide. If you provide multiple templates, these show up on the main page.

No matter how a document is created, you can share it with other users. You can limit editing rights to authenticated users or open up the document to everyone that you share the link with.

#### Dealing with fonts

Your choice of fonts can make a big difference in how your audience experiences the documents you create. There are tens of thousands of fonts, both free and paid. With Kotype there are no artificial limits to use any font you need to. If you use custom fonts in your documents, these may not available on all of the platforms you use.

There are three options to deal with this:

- the font is already included in the documents you import into Kotype, no action necessary
- add the fonts you use to your template documents (for instance with the WebODF based editor [Fontos](http://font.opendocumentformat.org/)
- or upload the separate fonts on the webserver, so that they render correctly inside the browser (but do not include the font file upon export). For instructions how to do this see below.

#### Avatars

By default Kotype shows an avatar of all users currently in an editing session of a specific document. By clicking on the avatar list on the right side, the presence of all avatars in the document can be toggled.

User can add their own personal avatar when their account is created, by clicking on the default avatar and uploading some image. Currently it is not yet possible to change the avatar after account creation, commits are welcome.

#### Creating and uploading a new document

The overview page shows a list of documents, and for each document some additional information. This includes the registered users that made changes to the document and a timestamp when a document was last edited.

#### Changing the title of a document

If you are editing a document, you can click on the Title at the top to change it. This title will also show up in the overview page.
