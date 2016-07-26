module.exports = function(
    options,
    compose
) {
    var self = this;

    this.compose = compose;
    this.q = require('q');
    this.lazyjs = require('lazy.js');
    this.expressApp = null;
    this.logger = null;
    this.routeIndex = null;
    this.isInitializationSuccessful = false;
    this.responseTypes = {
        VoidResponse: require('./VoidResponse'),
        DownloadResponse: require('./DownloadResponse'),
        FileResponse: require('./FileResponse'),
        RedirectResponse: require('./RedirectResponse'),
        StreamResponse: require('./StreamResponse'),
        ViewResponse: require('./ViewResponse'),
        Response: require('./Response')
    }

    this.mvcxConfig = null;
    this.appConfig = mergeConfig(options.configuration);
    this.mvcxConfig = self.appConfig.mvcx;

    if (typeof(options) !== 'undefined' && options !== null) {
        if (options.expressApp) {
            this.expressApp = options.expressApp;
        }
    }

    if (this.expressApp === null) {
        var express = require('express');
        this.expressApp = express();
    }

    this.initialize = function (onCompleted) {
        var cluster = null;
        self.q.Promise(function (resolve, reject, notify) {
            try {
                console.log('info: [mvcx] Initializing...');

                if (self.mvcxConfig.clusteringEnabled) {
                    cluster = require('cluster');
                    var numCPUs = require('os').cpus().length;
                    var appConfig = null;

                    if (cluster.isMaster) {
                        console.log('info: [mvcx] Clustering for ' + numCPUs + ' CPU cores...');

                        // Fork workers.
                        for (var i = 0; i < numCPUs; i++) {
                            console.log('info: [mvcx] Spawning worker ' + (i + 1) + '...');
                            cluster.fork();
                        }

                        console.log('info: [mvcx] Clustering intialized with ' + numCPUs + ' worker processes.');

                        cluster.on('exit', function (worker, code, signal) {
                            console.log('info: [mvcx] Worker process with process id ' + worker.process.pid + ' terminated.');
                        });
                    } else {
                        initializeCore();
                    }
                }
                else {
                    console.log('info: [mvcx] Clustering is disabled.');
                    initializeCore();
                }

                var result = {
                    expressApp: self.expressApp,
                    config: self.appConfig,
                    logger: self.logger
                };

                resolve(result);
            }
            catch (e) {
                reject(e);
            }
        }).then(function (result) {
            if (cluster === null || !cluster.isMaster) {
                self.logger.info('[mvcx] Initialization completed.');
                onCompleted(null, result);
            }
        }).catch(function (e) {
            var failureMessage = '[mvcx] Intialization failed.';
            if (self.logger != null) {
                self.logger.error(failureMessage);
            }
            else {
                console.log(failureMessage);
            }
            onCompleted(e, null);
        }).done();
    };

    this.createHttpServer = function (options) {
        if (!self.isInitializationSuccessful) {
            throw new Error('[mvcx] Unable create http server when mvcx has not been initialized successfully.');
        }

        self.logger.info('[mvcx] Creating http server...');

        var http = require('http');
        var server = http.createServer(self.expressApp);

        self.logger.info('[mvcx] Http server created.');

        createServerCore(server);

        return server;
    };

    this.createHttpsServer = function (options) {
        if (!self.isInitializationSuccessful) {
            throw new Error('[mvcx] Unable create https server when mvcx has not been initialized successfully.');
        }

        self.logger.info('[mvcx] Creating https server...');

        var https = require('https');
        var server = https.createServer(options, self.expressApp);

        self.logger.info('[mvcx] Https server created.');

        createServerCore(server);

        return server;
    };

    this.createWebSocket = function (server) {
        if (!self.isInitializationSuccessful) {
            throw new Error('[mvcx] Unable create web socket server when mvcx has not been initialized successfully.');
        }

        self.logger.info('[mvcx] Creating web socket (socket.io) server...');

        var socketio = require('socket.io');
        return socketio(server);

        self.logger.info('[mvcx] Web socket server created.');
    }

    function createServerCore(server) {
        server.on('connection', function (socket) {
            if (self.mvcxConfig.keepAliveTimeoutSeconds > 0) {
                //logger.debug('Connection opened. Setting keep alive timeout to %s seconds', config.keepAliveTimeoutSeconds);
                socket.setKeepAlive(true);
                socket.setTimeout(self.mvcxConfig.keepAliveTimeoutSeconds * 1000, function () {
                    //logger.debug('Connection closed after exceeding keep alive timeout.');
                });
            }
            else {
                socket.setKeepAlive(false);
            }
        });

        if (self.mvcxConfig.keepAliveTimeoutSeconds > 0) {
            self.logger.info('[mvcx] Server connection keep-alive timeout set to %s seconds.', self.mvcxConfig.keepAliveTimeoutSeconds);
        } else {
            self.logger.info('[mvcx] Server connection keep-alive is disabled.');
        }
    }

    function initializeCore() {
        self.logger = initializeLogging();

        //Add any data / helpers to be utilized within ejs templates to be placed in expressApp.locals.mvcx
        self.expressApp.locals.mvcx = {};

        if(typeof(self.compose) === 'function' && !isEmpty(self.mvcxConfig.hooks.ioc)){

            self.logger.info('[mvcx] Composing application dependencies...');
            self.compose(self.mvcxConfig.hooks.ioc);
            self.logger.info('[mvcx] Completed composing application dependencies successfully.');
        }

        initializeExpress();

        initializeAssets();

        initializeRoutes();

        initializeTemplateHelpers();

        self.isInitializationSuccessful = true;
    }

    function initializeAssets() {
        self.expressApp.locals.mvcx.assets = {};
        if (!isEmpty(self.mvcxConfig.assets)) {
            for (var route in self.mvcxConfig.assets) {
                if (self.mvcxConfig.assets.hasOwnProperty(route)) {
                    var assetConfig = self.mvcxConfig.assets[route];
                    registerAsset(self.expressApp, route, assetConfig);
                }
            }
        }
    }

    function initializeTemplateHelpers() {
        self.expressApp.locals.mvcx.actionUrl = function (controller, action, routeParams) {

            var actions = self.routeIndex.controllersActionsRoutes[controller];
            if(isEmpty(actions)){
                throw new Error("[mvcx] The specified controller '" + controller + "' does not exist." );
            }

            var routesArray = actions[action];
            if(isEmpty(routesArray)){
                throw new Error("[mvcx] The specified action '" + action + "' does not exist in controller '" + controller + "'." );
            }

            var urls = [];
            var UrlBuilder = require('url-assembler');

            var regexForUrlWithPathParams = null;
            var route = null;
            var builder = new UrlBuilder();
            if(isEmpty(routeParams)){
                builder = builder.template(routesArray[0].route);
            }
            else {

                if (!isEmpty(routeParams.path) && Object.keys(routeParams.path).length > 0) {
                    regexForUrlWithPathParams = "^.*";
                    for (var pathParam in routeParams.path) {
                        if (routeParams.path.hasOwnProperty(pathParam)) {
                            regexForUrlWithPathParams += "(?=.*\\/:" + pathParam + "(\\/|$))"
                        }
                    }

                    regexForUrlWithPathParams += ".*$";

                    for (var i = 0; i < routesArray.length; i++) {
                        var regex = new RegExp(regexForUrlWithPathParams, 'g');
                        if (regex.test(routesArray[i].route)) {
                            route = routesArray[i].route;
                            break;
                        }
                    }

                    if (route === null) {
                        throw new Error("[mvcx] No routes were found matching the specified path parameters '" + JSON.stringify(routeParams.path) + "' for action '" + action + "' in controller '" + controller + "'.");
                    }

                    builder = builder.template(route);
                    builder = builder.param(routeParams.path);
                }
                else{
                    builder = builder.template(routesArray[0].route);
                }

                if (!isEmpty(routeParams.query)) {
                    builder = builder.query(routeParams.query);
                }
            }

            return builder.toString();
        }
    }

    function initializeRoutes() {
        self.logger.info('[mvcx] Loading routes...');

        self.routeIndex = createRouteIndex();

        if (isEmpty(self.routeIndex.controllers) || Object.keys(self.routeIndex.controllers).length === 0) {
            self.logger.info('[mvcx] No controllers were found.');
        }
        else {
            self.logger.info('[mvcx] Found ' + Object.keys(self.routeIndex.controllers).length + ' controller(s).');
            if (self.mvcxConfig.autoRoutesEnabled) {
                self.logger.info('[mvcx] Automatic routing enabled.');
            }
            else {
                self.logger.info('[mvcx] Automatic routing disabled.');
            }

            var iocContainer = self.mvcxConfig.hooks.ioc;

            for(var controllerName in self.routeIndex.controllersActionsRoutes){
                if(self.routeIndex.controllersActionsRoutes.hasOwnProperty(controllerName)){
                    var controllerModule = self.routeIndex.controllers[controllerName];
                    iocContainer.register(controllerName, controllerModule.module, 'perRequest');

                    var metaInstance = iocContainer.resolve(controllerName);
                    controllerModule.metaInstance = metaInstance;

                    extendController(controllerModule.moduleName, controllerModule.module);

                    var actionsHash = self.routeIndex.controllersActionsRoutes[controllerName];
                    for(var action in actionsHash){
                        if(actionsHash.hasOwnProperty(action) && typeof(controllerModule.metaInstance[action]) === 'function'){
                            extendAction(controllerModule.module, action);

                            var routesArray = actionsHash[action];
                            for(var i = 0; i < routesArray.length; i++){
                                registerControllerBasedRoute(routesArray[i], controllerModule.module.$type);
                            }
                        }
                    }
                }
            }

            for(var i=0; i < self.routeIndex.viewRoutes.length; i++){
                var route = self.routeIndex.viewRoutes[i];
                registerViewBasedRoute(route.method, route.route, route.view);
            }
        }

        self.logger.info('[mvcx] Loading routes completed.');
    };

    function mergeConfig(configOptions) {
        var environment;
        var config;
        console.log('info: [mvcx] Initializing configuration...');

        var baseConfig = configOptions.base;
        if (typeof(baseConfig) === 'undefined' || baseConfig == null) {
            baseConfig = {};
        }

        var merge = require('merge');

        console.log('info: [mvcx] Checking current environment configuration indicator...');

        if (!isEmpty(configOptions.current)) {
            console.log('info: [mvcx] Loading configuration override for ' + configOptions.current + ' environment.');
            var overrideConfig = configOptions.overrides[configOptions.current];
            if (!(overrideConfig)) {
                throw new Error('[mvcx] The ' + env + ' environment configuration override is missing.');
            }

            console.log('info: [mvcx] Merging configuration override for ' + configOptions.current + ' environment...');
            config = merge.recursive(true, baseConfig, overrideConfig);
        }
        else {
            console.log('info: [mvcx] No environment indicator found. Continuing with the base configuration...');
            config = baseConfig;
        }

        var overriddenMvcxConfig = config.mvcx;
        if (isEmpty(overriddenMvcxConfig)) {
            overriddenMvcxConfig = {};
        }

        console.log('info: [mvcx] Merging mvcx default configuration with specified overrides from the application configuration...');
        var path = require('path');
        config.mvcx = merge.recursive(true, require(path.join(__dirname, 'DefaultConfig')), overriddenMvcxConfig);

        if (!isEmpty(config.mvcx.assets) && !isEmpty(config.mvcx.assets.paths) && config.mvcx.assets.paths.length > 0) {
            console.log('info: [mvcx] Resolving asset paths...');

            var assetPaths = [];
            self.lazyjs(config.mvcx.assets.paths).each(function (assetPath) {
                assetPaths.push(path.resolve(assetPath));
            });
            config.mvcx.assets.paths = assetPaths;
        }

        config.internalViewPath = path.join(__dirname, 'views');

        console.log('info: [mvcx] Configuration initialized.');
        return config;
    }

    function isEmpty(val) {
        return (typeof (val) === 'undefined' || val == null);
    }

    function initializeExpress() {
        self.logger.info('[mvcx] Creating express app...');
        var path = require('path');
        var iocContainer = self.mvcxConfig.hooks.ioc;
        self.expressApp.locals.mvcx.config = self.appConfig;

        self.logger.info('[mvcx] Registering standard middleware...');

        if (isEmpty(self.mvcxConfig.viewEngine)) {
            self.logger.info('[mvcx] No view engine specified.');
        }
        else {
            self.logger.info('[mvcx] Registering view engine...');
            self.expressApp.set('view engine', self.mvcxConfig.viewEngine);
            self.expressApp.set('views', path.resolve(self.mvcxConfig.viewPath));
        }

        if (self.mvcxConfig.compressionEnabled) {
            var compress = require('compression');
            self.expressApp.use(compress());
            self.logger.info('[mvcx] Gzip compression is enabled.');
        }
        else {
            self.logger.info('[mvcx] Gzip compression is disabled.');
        }

        self.logger.info('[mvcx] Registering body parser with url encoding and json support...');
        var bodyParser = require('body-parser');
        self.expressApp.use(bodyParser.urlencoded({extended: false}));
        self.expressApp.use(bodyParser.json({limit: (self.mvcxConfig.requestLimitKB) + "kb"}));

        self.logger.info('[mvcx] Standard middleware registration completed.');
    }

    function initializeLogging() {
        var logger;

        var winston = require('winston');
        winston.emitErrs = true;

        var winstonTransports = [];
        if (self.mvcxConfig.loggerAppenders && self.mvcxConfig.loggerAppenders.length > 0) {
            for (var i = 0; i < self.mvcxConfig.loggerAppenders.length; i++) {
                var appender = self.mvcxConfig.loggerAppenders[i];
                winstonTransports.push(new winston.transports[appender.type](appender.options));
            }
        }
        else {
            winstonTransports.push(new winston.transports.Console({
                level: 'silly',
                handleExceptions: true,
                json: false,
                colorize: true
            }));
        }

        logger = new winston.Logger({
            transports: winstonTransports,
            exitOnError: false
        });

        logger.info('[mvcx] Overriding Console.log...');

        console.log = logger.debug;

        logger.info('[mvcx] Logger initialized.');

        return logger;
    }

    function createRouteIndex() {

        var routeIndex = {
            controllers: {},
            controllersActionsRoutes: {},
            controllersMethodsRoutes: {},
            viewRoutes: []
        }

        var ModuleLoader = require('./ModuleLoader');
        var moduleLoader = new ModuleLoader();
        var path = require('path');

        var allControllerModules = moduleLoader.load(path.resolve(self.mvcxConfig.controllerPath), self.mvcxConfig.controllerSuffix);

        if (!isEmpty(self.mvcxConfig.routes)) {
            for(var i=0; i < self.mvcxConfig.routes.length; i++){
                var route = self.mvcxConfig.routes[i];

                if (!isEmpty(route.controller)) {
                    var controllerModule = allControllerModules[route.controller];
                    if(isEmpty(controllerModule)){
                        throw new Error('[mvcx] The controller ' + route.controller + ' specified by route ' + route.route + ' was not found.')
                    }

                    routeIndex.controllers[controllerModule.moduleName] = controllerModule;

                    if(isEmpty(routeIndex.controllersActionsRoutes[route.controller])){
                        var actions = {};
                        actions[route.action] = [route];
                        routeIndex.controllersActionsRoutes[route.controller] = actions;
                    }
                    else {
                        var actions = routeIndex.controllersActionsRoutes[route.controller];
                        if (isEmpty(actions[route.action])) {
                            actions[route.action] = [route];
                        }
                        else {
                            actions[route.action].push(route);
                        }
                    }

                    if (isEmpty(routeIndex.controllersMethodsRoutes[route.controller])) {
                        var methods = {};
                        methods[route.method] = [route];
                        routeIndex.controllersMethodsRoutes[route.controller] = methods;
                    }
                    else {
                        var methods = routeIndex.controllersMethodsRoutes[route.controller];
                        if (isEmpty(methods[route.method])) {
                            methods[route.method] = [route];
                        }
                        else {
                            methods[route.method].push(route);
                        }
                    }
                }
                else if (!isEmpty(route.view)) {
                    routeIndex.viewRoutes.push(route);
                }
                else {
                    throw new Error('[mvcx] Invalid route (' + route.route + ') encountered with no controller or view specified.')
                }
            }
        }

        if (self.mvcxConfig.autoRoutesEnabled) {
            for(var controllerName in allControllerModules) {
                if (allControllerModules.hasOwnProperty(controllerName)) {
                    var controllerModuleForAutoRoute = allControllerModules[controllerName];

                    var routeForGetDefined = false;
                    var routeForPutDefined = false;
                    var routeForPostDefined = false;
                    var routeForDeleteDefined = false;
                    var routeForPatchDefined = false;
                    if (!isEmpty(routeIndex.controllersMethodsRoutes[controllerName])) {
                        var explicitlyDefinedRouteMethods = routeIndex.controllersMethodsRoutes[controllerName];
                        routeForGetDefined = !isEmpty(explicitlyDefinedRouteMethods['get']);
                        routeForPutDefined = !isEmpty(explicitlyDefinedRouteMethods['put']);
                        routeForPostDefined = !isEmpty(explicitlyDefinedRouteMethods['post']);
                        routeForDeleteDefined = !isEmpty(explicitlyDefinedRouteMethods['delete']);
                        routeForPatchDefined = !isEmpty(explicitlyDefinedRouteMethods['patch']);
                    }

                    var autoRoute = null;
                    if (!routeForGetDefined) {
                        indexAutoRoute(routeIndex, 'get', controllerModuleForAutoRoute);
                    }

                    if (!routeForPutDefined) {
                        indexAutoRoute(routeIndex, 'put', controllerModuleForAutoRoute);
                    }

                    if (!routeForPostDefined) {
                        indexAutoRoute(routeIndex, 'post', controllerModuleForAutoRoute);
                    }

                    if (!routeForDeleteDefined) {
                        indexAutoRoute(routeIndex, 'delete', controllerModuleForAutoRoute);
                    }

                    if (!routeForPatchDefined) {
                        indexAutoRoute(routeIndex, 'patch', controllerModuleForAutoRoute);
                    }
                }
            }
        }

        for(var controllerName in routeIndex.controllersActionsRoutes){
            if(routeIndex.controllersActionsRoutes.hasOwnProperty(controllerName)){
                var actions = routeIndex.controllersActionsRoutes[controllerName];

                for(var actionName in actions){
                    if(actions.hasOwnProperty(actionName)){
                        var routesArray = actions[actionName];

                        for(var i=0; i < routesArray.length; i++){
                            var modelRoute = routesArray[i];

                            var requestModuleName = null;
                            var modelSpecified = false;
                            if(!isEmpty(modelRoute.requestModel)){
                                modelSpecified = true;
                                requestModuleName = modelRoute.requestModel;
                            }
                            else{
                                requestModuleName = routeIndex.controllers[controllerName].modulePrefix + '-' + actionName + self.mvcxConfig.requestModelSuffix;
                            }

                            var path = require('path');
                            var requestModelFilePath = path.join(path.resolve(self.mvcxConfig.modelPath), requestModuleName);
                            var fs = require('fs');
                            try {
                                //fs.statSync(requestModelFilePath);
                                modelRoute.requestModelSchema = require(requestModelFilePath);
                            }
                            catch (e) {
                                if(modelSpecified){
                                    throw new Error("[mvcx] The specified request model was not accessible: '" + requestModelFilePath + "'. Please check whether the file exists and is accessible.")
                                }
                            }
                        }
                    }
                }
            }
        }

        return routeIndex;
    }

    function indexAutoRoute(routeIndex, method, controllerModule) {
        var route = {
            method: method,
            route: '/' + controllerModule.modulePrefix,
            controller: controllerModule.moduleName,
            action: method
        };

        if(isEmpty(routeIndex.controllers[controllerModule.moduleName])) routeIndex.controllers[controllerModule.moduleName] = controllerModule;
        if(isEmpty(routeIndex.controllersMethodsRoutes[controllerModule.moduleName])) routeIndex.controllersMethodsRoutes[controllerModule.moduleName] = {};
        if(isEmpty(routeIndex.controllersActionsRoutes[controllerModule.moduleName])) routeIndex.controllersActionsRoutes[controllerModule.moduleName] = {};
        routeIndex.controllersMethodsRoutes[controllerModule.moduleName][method] = [route];
        routeIndex.controllersActionsRoutes[controllerModule.moduleName][method] = [route];
    }

    function extendController(controllerModuleName, controllerModule) {
        if (isEmpty(controllerModule.$type)) {
            controllerModule.$type = self.mvcxConfig.controllerType;
        }

        var extensions = {};
        var path = require('path');

        if (controllerModule.$type === 'mvc') {
            extensions.view = function (view, model) {
                if (view.indexOf('/') == -1) {
                    view = path.join(controllerModuleName.substring(0, controllerModuleName.length - self.mvcxConfig.controllerSuffix.length), view);
                }

                return new self.responseTypes.ViewResponse(view, model);
            };
        }

        extensions.redirect = function (route) {
            return new self.responseTypes.RedirectResponse(route);
        }

        extensions.file = function (filePath, options) {
            return new self.responseTypes.FileResponse(filePath, options);
        }

        extensions.download = function (filePath, downloadedFilename) {
            return new self.responseTypes.DownloadResponse(filePath, downloadedFilename);
        }

        extensions.stream = function (stream) {
            return new self.responseTypes.StreamResponse(stream);
        }

        extensions.void = function () {
            return new self.responseTypes.VoidResponse();
        }

        extensions.response = function () {
            return new self.responseTypes.Response();
        }

        controllerModule.prototype.mvcx = extensions;
    }

    function extendAction(controllerModule, actionName) {
        var controllerAction = controllerModule.prototype[actionName];
        controllerModule.prototype[actionName] = function (model, req, res, next) {
            return controllerAction(model, req, res, next);
        }
    }

    function registerControllerBasedRoute(route, controllerType) {
        var iocContainer = self.mvcxConfig.hooks.ioc;

        var url = require('url');
        var formattedRoute = url.resolve(url.resolve(url.resolve('/', self.mvcxConfig.baseUrlPrefix), '/'), route.route);

        self.logger.info('[mvcx] Registering controller action ' + route.controller + '.' + route.action + ' with route ' + formattedRoute + '...');
        self.expressApp[route.method](formattedRoute, function (req, res, next) {
            var controller = iocContainer.resolve(route.controller);
            invokeControllerAction(route, controller, controllerType, req, res, next);
        });
    }

    function registerViewBasedRoute(method, route, view) {
        self.logger.info('[mvcx] Registering view ' + view + ' with route ' + route + '...');
        self.expressApp[method](route, function (req, res, next) {
            res.render(view);
        });
    }

    function invokeControllerAction(route, controller, controllerType, req, res, next) {
        try {
            var model = createRequestModel(null, req);

            var result = controller[route.action](model, req, res, next);
            if (!isEmpty(result) && self.q.isPromise(result)) {
                result.then(function (response) {
                    createSuccessResponse(controllerType, response, res);
                }).catch(function (e) {
                    createErrorResponse(controllerType, e, res);
                });
            }
            else {
                createSuccessResponse(controllerType, result, res);
            }
        }
        catch (e) {
            createErrorResponse(controllerType, e, res);
        }
    }

    function createRequestModel(modelSchema, req){

        var merge = require('merge');
        var model = merge.recursive(true, req.query, req.params);
        return merge.recursive(true, model, req.body);
    }

    function createSuccessResponse(controllerType, response, res) {
        if (typeof(response) === 'undefined') {
            createErrorResponse(controllerType, new Error('[mvcx] Controller action did not return a response.'), res);
        }
        else {
            if (response == null || response instanceof self.responseTypes.VoidResponse) {
                res.status(200);
            }
            else if (response instanceof self.responseTypes.ViewResponse) {
                if (response.model == null) {
                    res.render(response.view);
                }
                else {
                    res.render(response.view, response.model);
                }
            }
            else if (response instanceof self.responseTypes.DownloadResponse) {
                if (response.downloadedFilename == null) {
                    res.download(response.filePath);
                }
                else {
                    res.download(response.filePath, response.downloadedFilename);
                }
            }
            else if (response instanceof self.responseTypes.FileResponse) {
                if (response.options == null) {
                    res.sendFile(response.filePath);
                }
                else {
                    res.sendFile(response.filePath, response.options)
                }
            }
            else if (response instanceof self.responseTypes.RedirectResponse) {
                if (response.status == null) {
                    res.redirect(response.route);
                }
                else {
                    res.redirect(response.status, response.route);
                }
            }
            else if (response instanceof self.responseTypes.StreamResponse) {
                res.setHeader("content-type", response.contentType);
                res.stream.pipe(res);
            }
            else if (response instanceof self.responseTypes.Response) {
                response.handler(res);
            }
            else {
                res.status(200).json(response);
            }
        }
    }

    function createErrorResponse(controllerType, e, res) {
        var errorHandlerHook = self.mvcxConfig.hooks.errorHandlers[controllerType];

        if (isEmpty(errorHandlerHook)) {
            throw new Error('[mvcx] No error handler specified for controller type ' + controllerType + '.');
        }

        var hookOptions = {
            response: res,
            error: e,
            includeErrorStackInResponse: self.mvcxConfig.includeErrorStackInResponse
        };
        errorHandlerHook.createResponse(self.appConfig, hookOptions);
    }

    function registerAsset(expressApp, route, assetConfig) {
        var fingerprintQueryKey = '__fingerprint';
        var rdType = typeof(assetConfig);
        if (rdType === 'string') {
            var path = require('path');
            var assetFile = path.resolve(assetConfig);
            fingerprintAsset(expressApp, route, [assetFile], fingerprintQueryKey);
            expressApp.get(route, function (req, res) {
                res.sendFile(assetFile);
            });
        }
        else if (assetConfig !== null && rdType === 'object') {

            if (typeof(assetConfig['browserify']) !== 'undefined' && assetConfig['browserify'] !== null) {
                var browserifyConfig = assetConfig['browserify'];
                var browserifyModules = browserifyConfig['modules'];
                if (typeof(browserifyModules) !== 'undefined' && browserifyModules !== null) {
                    var browserify = require('browserify-middleware');
                    browserify.settings.mode = 'production';

                    var browserifyOptions = browserifyConfig['options'];
                    if (typeof(browserifyOptions) === 'undefined' || browserifyOptions === null) {
                        browserifyOptions = {
                            minify: false,
                            gzip: false,
                            debug: true
                        };
                    }
                    browserifyOptions.mode = 'production';

                    if (typeof(browserifyOptions.cache) === 'undefined'
                        || browserifyOptions.cache === null
                        || (typeof(browserifyOptions.cache) === 'boolean' && browserifyOptions.cache === false)
                        || (typeof(browserifyOptions.cache) === 'string' && browserifyOptions.cache === '')) {
                        browserifyOptions.cache = 1000;
                    }

                    browserifyOptions.precompile = true;
                    browserifyOptions.postcompile = function (source) {
                        fingerprintAsset(expressApp, route, source, fingerprintQueryKey);
                        return source;
                    };

                    expressApp.get(route, browserify(browserifyModules, browserifyOptions));
                }
                else {
                    throw new Error('[mvcx] Invalid route definition specified for asset ' + route + '.');
                }
            }
            else {
                throw new Error('[mvcx] Invalid route definition specified for asset ' + route + '.');
            }
        }
        else {
            throw new Error('[mvcx] Invalid route definition specified for asset ' + route + '.');
        }
    }

    function fingerprintAsset(expressApp, route, filesOrData, query) {
        var Uri = require('urijs');
        var url = new Uri(route);

        var fingerprint = '';
        if (typeof(filesOrData) !== 'undefined' && filesOrData !== null) {
            if (Array.isArray(filesOrData) && filesOrData.length > 0) {
                var hashFiles = require('hash-files');
                fingerprint = hashFiles.sync({files: filesOrData, algorithm: 'md5'});
            }
            else if (typeof(filesOrData) === 'string' && filesOrData.length > 0) {
                var crypto = require('crypto');
                fingerprint = crypto.createHash('md5').update(filesOrData).digest('hex');
            }
            else {
                throw new Error('[mvcx] Invalid content encountered for asset ' + route + '.');
            }

            if (fingerprint !== null && fingerprint.length > 0) {
                url.addQuery(query, fingerprint);
            }
        }

        expressApp.locals.mvcx.assets[route] = url.toString();
    }
};
