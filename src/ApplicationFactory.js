module.exports = function(
    options,
    onCompose
) {
    const self = this;
    this._q = require('q');
    this._lazyjs = require('lazy.js');
    this._merge = require('merge');
    let Ajv = require('ajv');

    this._appConfig = mergeConfig(options.configuration);
    this._mvcxConfig = self._appConfig.mvcx;
    this._requestSchemaValidator = new Ajv(self._mvcxConfig.schemaValidation.request);

    onCompose(self._mvcxConfig.hooks.ioc);

    this._express = null;
    this._logger = null;
    this._routeIndex = null;
    this._isInitializationSuccessful = false;
    this._responseTypes = {
        VoidResponse: require('./VoidResponse'),
        DownloadResponse: require('./DownloadResponse'),
        FileResponse: require('./FileResponse'),
        RedirectResponse: require('./RedirectResponse'),
        StreamResponse: require('./StreamResponse'),
        ViewResponse: require('./ViewResponse'),
        Response: require('./Response')
    }    

    if (typeof(options) !== 'undefined' && options !== null) {
        if (options.express) {
            this._express = options.express;
        }
    }

    if (this._express === null) {
        let express = require('express');
        this._express = express();
    }

    this.create = function (onCompleted) {
        let cluster = null;
        self._q.Promise(function (resolve, reject, notify) {
            try {
                console.log('info: [mvcx] Initializing...');

                if (self._mvcxConfig.clusteringEnabled) {
                    cluster = require('cluster');
                    let numCPUs = require('os').cpus().length;
                    let appConfig = null;

                    if (cluster.isMaster) {
                        console.log('info: [mvcx] Clustering for ' + numCPUs + ' CPU cores...');

                        // Fork workers.
                        for (let i = 0; i < numCPUs; i++) {
                            console.log('info: [mvcx] Spawning worker ' + (i + 1) + '...');
                            cluster.fork();
                        }

                        console.log('info: [mvcx] Clustering intialized with ' + numCPUs + ' worker processes.');

                        cluster.on('exit', function (worker, code, signal) {
                            console.log('info: [mvcx] Worker process with process id ' + worker.process.pid + ' terminated.');
                        });
                    } else {
                        initialize();
                    }
                }
                else {
                    console.log('info: [mvcx] Clustering is disabled.');
                    initialize();
                }

                let newApp = {
                    express: self._express,
                    config: self._appConfig,
                    logger: self._logger,
                    container: self._mvcxConfig.hooks.ioc,
                    createHttp: createHttp,
                    createHttps: createHttps,
                    createSocketIO: createSocketIO
                };

                resolve(newApp);
            }
            catch (e) {
                reject(e);
            }
        }).then(function (result) {
            if (cluster === null || !cluster.isMaster) {
                self._logger.info('[mvcx] Initialization completed.');
                onCompleted(null, result);
            }
        }).catch(function (e) {
            let failureMessage = '[mvcx] Intialization failed.';
            if (self._logger != null) {
                self._logger.error(failureMessage);
            }
            else {
                console.log(failureMessage);
            }
            onCompleted(e, null);
        }).done();
    };

    function createHttp (options) {
        if (!self._isInitializationSuccessful) {
            throw new Error('[mvcx] Unable create http server when mvcx has not been initialized successfully.');
        }

        self._logger.info('[mvcx] Creating http server...');

        let http = require('http');
        let server = http.createServer(self._express);

        self._logger.info('[mvcx] Http server created.');

        createServerCore(server);

        return server;
    };

    function createHttps(options) {
        if (!self._isInitializationSuccessful) {
            throw new Error('[mvcx] Unable create https server when mvcx has not been initialized successfully.');
        }

        self._logger.info('[mvcx] Creating https server...');

        let https = require('https');
        let server = https.createServer(options, self._express);

        self._logger.info('[mvcx] Https server created.');

        createServerCore(server);

        return server;
    };

    function createSocketIO(server) {
        if (!self._isInitializationSuccessful) {
            throw new Error('[mvcx] Unable create web socket server when mvcx has not been initialized successfully.');
        }

        self._logger.info('[mvcx] Creating web socket (socket.io) server...');

        let socketio = require('socket.io');
        return socketio(server);

        self._logger.info('[mvcx] Web socket server created.');
    }

    function createServerCore(server) {
        server.on('connection', function (socket) {
            if (self._mvcxConfig.keepAliveTimeoutSeconds > 0) {
                //logger.debug('Connection opened. Setting keep alive timeout to %s seconds', config.keepAliveTimeoutSeconds);
                socket.setKeepAlive(true);
                socket.setTimeout(self._mvcxConfig.keepAliveTimeoutSeconds * 1000, function () {
                    //logger.debug('Connection closed after exceeding keep alive timeout.');
                });
            }
            else {
                socket.setKeepAlive(false);
            }
        });

        if (self._mvcxConfig.keepAliveTimeoutSeconds > 0) {
            self._logger.info('[mvcx] Server connection keep-alive timeout set to %s seconds.', self._mvcxConfig.keepAliveTimeoutSeconds);
        } else {
            self._logger.info('[mvcx] Server connection keep-alive is disabled.');
        }
    }

    function initialize(onCompose) {
        self._logger = initializeLogging();       

        //Add any data / helpers to be utilized within ejs templates to be placed in express.locals.mvcx
        self._express.locals.mvcx = {};

        initializeExpress();

        initializeAssets();

        initializeRoutes();

        initializeTemplateHelpers();

        self._isInitializationSuccessful = true;
    }

    function initializeAssets() {
        self._express.locals.mvcx.assets = {};
        if (!isEmpty(self._mvcxConfig.assets)) {
            for (let route in self._mvcxConfig.assets) {
                if (self._mvcxConfig.assets.hasOwnProperty(route)) {
                    let assetConfig = self._mvcxConfig.assets[route];
                    registerAsset(self._express, route, assetConfig);
                }
            }
        }
    }

    function initializeTemplateHelpers() {
        self._express.locals.mvcx.actionUrl = function (controller, action, routeParams) {

            let actions = self._routeIndex.controllersActionsRoutes[controller];
            if(isEmpty(actions)){
                throw new Error("[mvcx] The specified controller '" + controller + "' does not exist." );
            }

            let routesArray = actions[action];
            if(isEmpty(routesArray)){
                throw new Error("[mvcx] The specified action '" + action + "' does not exist in controller '" + controller + "'." );
            }

            let urls = [];
            let UrlBuilder = require('url-assembler');

            let regexForUrlWithPathParams = null;
            let route = null;
            let builder = new UrlBuilder();
            if(isEmpty(routeParams)){
                builder = builder.template(routesArray[0].route);
            }
            else {

                if (!isEmpty(routeParams.path) && Object.keys(routeParams.path).length > 0) {
                    regexForUrlWithPathParams = "^.*";
                    for (let pathParam in routeParams.path) {
                        if (routeParams.path.hasOwnProperty(pathParam)) {
                            regexForUrlWithPathParams += "(?=.*\\/:" + pathParam + "(\\/|$))"
                        }
                    }

                    regexForUrlWithPathParams += ".*$";

                    for (let i = 0; i < routesArray.length; i++) {
                        let regex = new RegExp(regexForUrlWithPathParams, 'g');
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
        self._logger.info('[mvcx] Loading routes...');

        self._routeIndex = createRouteIndex();

        if (isEmpty(self._routeIndex.controllers) || Object.keys(self._routeIndex.controllers).length === 0) {
            self._logger.info('[mvcx] No controllers were found.');
        }
        else {
            self._logger.info('[mvcx] Found ' + Object.keys(self._routeIndex.controllers).length + ' controller(s).');
            if (self._mvcxConfig.autoRoutesEnabled) {
                self._logger.info('[mvcx] Automatic routing enabled.');
            }
            else {
                self._logger.info('[mvcx] Automatic routing disabled.');
            }

            let iocContainer = self._mvcxConfig.hooks.ioc;

            for(let controllerName in self._routeIndex.controllersActionsRoutes){
                if(self._routeIndex.controllersActionsRoutes.hasOwnProperty(controllerName)){
                    let controllerModule = self._routeIndex.controllers[controllerName];
                    
                    extendController(controllerModule.moduleName, controllerModule.module);

                    let actionsHash = self._routeIndex.controllersActionsRoutes[controllerName];
                    for(let action in actionsHash){
                        if(actionsHash.hasOwnProperty(action) && typeof(controllerModule.module.prototype[action]) === 'function'){
                            extendAction(controllerModule.module, action);

                            let routesArray = actionsHash[action];
                            for(let i = 0; i < routesArray.length; i++){
                                registerControllerBasedRoute(routesArray[i], controllerModule.module);
                            }
                        }
                    }

                    iocContainer.register(controllerName, controllerModule.module, 'perRequest');
                }
            }

            for(let i=0; i < self._routeIndex.viewRoutes.length; i++){
                let route = self._routeIndex.viewRoutes[i];
                registerViewBasedRoute(route.method, route.route, route.view);
            }
        }

        self._logger.info('[mvcx] Loading routes completed.');
    };

    function mergeConfig(configOptions) {
        let environment;
        let config;
        console.log('info: [mvcx] Initializing configuration...');

        let baseConfig = configOptions.base;
        if (typeof(baseConfig) === 'undefined' || baseConfig == null) {
            baseConfig = {};
        }

        console.log('info: [mvcx] Checking current environment configuration indicator...');

        if (!isEmpty(configOptions.current)) {
            console.log('info: [mvcx] Loading configuration override for ' + configOptions.current + ' environment.');
            let overrideConfig = configOptions.overrides[configOptions.current];
            if (!(overrideConfig)) {
                throw new Error('[mvcx] The ' + env + ' environment configuration override is missing.');
            }

            console.log('info: [mvcx] Merging configuration override for ' + configOptions.current + ' environment...');
            config = self._merge.recursive(true, baseConfig, overrideConfig);
        }
        else {
            console.log('info: [mvcx] No environment indicator found. Continuing with the base configuration...');
            config = baseConfig;
        }

        let overriddenMvcxConfig = config.mvcx;
        if (isEmpty(overriddenMvcxConfig)) {
            overriddenMvcxConfig = {};
        }

        console.log('info: [mvcx] Merging mvcx default configuration with specified overrides from the application configuration...');
        let path = require('path');
        config.mvcx = self._merge.recursive(true, require(path.join(__dirname, 'DefaultConfig')), overriddenMvcxConfig);

        if (!isEmpty(config.mvcx.assets) && !isEmpty(config.mvcx.assets.paths) && config.mvcx.assets.paths.length > 0) {
            console.log('info: [mvcx] Resolving asset paths...');

            let assetPaths = [];
            self._lazyjs(config.mvcx.assets.paths).each(function (assetPath) {
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
        self._logger.info('[mvcx] Creating express app...');
        let path = require('path');
        let iocContainer = self._mvcxConfig.hooks.ioc;
        self._express.locals.mvcx.config = self._appConfig;

        self._logger.info('[mvcx] Registering standard middleware...');

        if (isEmpty(self._mvcxConfig.viewEngine)) {
            self._logger.info('[mvcx] No view engine specified.');
        }
        else {
            self._logger.info('[mvcx] Registering view engine...');
            self._express.set('view engine', self._mvcxConfig.viewEngine);
            self._express.set('views', path.resolve(self._mvcxConfig.viewPath));
        }

        if (self._mvcxConfig.compressionEnabled) {
            let compress = require('compression');
            self._express.use(compress());
            self._logger.info('[mvcx] Gzip compression is enabled.');
        }
        else {
            self._logger.info('[mvcx] Gzip compression is disabled.');
        }

        self._logger.info('[mvcx] Registering body parser with url encoding and json support...');
        let bodyParser = require('body-parser');
        self._express.use(bodyParser.urlencoded({extended: false}));
        self._express.use(bodyParser.json({limit: (self._mvcxConfig.requestLimitKB) + "kb"}));

        self._logger.info('[mvcx] Standard middleware registration completed.');
    }

    function initializeLogging() {
        let logger;

        let winston = require('winston');
        winston.emitErrs = true;

        let winstonTransports = [];
        if (self._mvcxConfig.loggerAppenders && self._mvcxConfig.loggerAppenders.length > 0) {
            for (let i = 0; i < self._mvcxConfig.loggerAppenders.length; i++) {
                let appender = self._mvcxConfig.loggerAppenders[i];
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

        // logger.info('[mvcx] Overriding Console.log...');

        // console.log = logger.debug;

        // logger.info('[mvcx] Logger initialized.');

        return logger;
    }

    function createRouteIndex() {

        let routeIndex = {
            controllers: {},
            controllersActionsRoutes: {},
            controllersMethodsRoutes: {},
            viewRoutes: []
        }

        let ModuleLoader = require('./ModuleLoader');
        let moduleLoader = new ModuleLoader();
        let path = require('path');
        
        let allControllerModules = moduleLoader.load(path.resolve(self._mvcxConfig.controllerPath), self._mvcxConfig.controllerSuffix);

        if (!isEmpty(self._mvcxConfig.routes)) {
            for(let i=0; i < self._mvcxConfig.routes.length; i++){
                let route = self._mvcxConfig.routes[i];

                if (!isEmpty(route.controller)) {
                    let controllerModule = allControllerModules[route.controller];
                    if(isEmpty(controllerModule)){
                        throw new Error('[mvcx] The controller ' + route.controller + ' specified by route ' + route.route + ' was not found.')
                    }

                    routeIndex.controllers[controllerModule.moduleName] = controllerModule;

                    if(isEmpty(routeIndex.controllersActionsRoutes[route.controller])){
                        let actions = {};
                        actions[route.action] = [route];
                        routeIndex.controllersActionsRoutes[route.controller] = actions;
                    }
                    else {
                        let actions = routeIndex.controllersActionsRoutes[route.controller];
                        if (isEmpty(actions[route.action])) {
                            actions[route.action] = [route];
                        }
                        else {
                            actions[route.action].push(route);
                        }
                    }

                    if (isEmpty(routeIndex.controllersMethodsRoutes[route.controller])) {
                        let methods = {};
                        methods[route.method] = [route];
                        routeIndex.controllersMethodsRoutes[route.controller] = methods;
                    }
                    else {
                        let methods = routeIndex.controllersMethodsRoutes[route.controller];
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

        if (self._mvcxConfig.autoRoutesEnabled) {
            for(let controllerName in allControllerModules) {
                if (allControllerModules.hasOwnProperty(controllerName)) {
                    let controllerModuleForAutoRoute = allControllerModules[controllerName];

                    let routeForGetDefined = false;
                    let routeForPutDefined = false;
                    let routeForPostDefined = false;
                    let routeForDeleteDefined = false;
                    let routeForPatchDefined = false;
                    if (!isEmpty(routeIndex.controllersMethodsRoutes[controllerName])) {
                        let explicitlyDefinedRouteMethods = routeIndex.controllersMethodsRoutes[controllerName];
                        routeForGetDefined = !isEmpty(explicitlyDefinedRouteMethods['get']);
                        routeForPutDefined = !isEmpty(explicitlyDefinedRouteMethods['put']);
                        routeForPostDefined = !isEmpty(explicitlyDefinedRouteMethods['post']);
                        routeForDeleteDefined = !isEmpty(explicitlyDefinedRouteMethods['delete']);
                        routeForPatchDefined = !isEmpty(explicitlyDefinedRouteMethods['patch']);
                    }

                    let autoRoute = null;
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

        for(let controllerName in routeIndex.controllersActionsRoutes){
            if(routeIndex.controllersActionsRoutes.hasOwnProperty(controllerName)){
                let actions = routeIndex.controllersActionsRoutes[controllerName];

                for(let actionName in actions){
                    if(actions.hasOwnProperty(actionName)){
                        let routesArray = actions[actionName];

                        for(let i=0; i < routesArray.length; i++){
                            let modelRoute = routesArray[i];
                            modelRoute.requestModelSchema = null;

                            if(modelRoute.requestModel !== null) {
                                let requestModuleName = null;
                                let modelSpecified = false;
                                if (!isEmpty(modelRoute.requestModel)) {
                                    modelSpecified = true;
                                    requestModuleName = modelRoute.requestModel;
                                }
                                else {
                                    requestModuleName = actionName + self._mvcxConfig.requestModelSuffix;
                                }

                                let path = require('path');
                                let requestModelFilePath = path.join(path.resolve(self._mvcxConfig.modelPath), routeIndex.controllers[controllerName].modulePrefix, requestModuleName);
                                let fs = require('fs');
                                try {
                                    //fs.statSync(requestModelFilePath);
                                    modelRoute.requestModelSchema = require(requestModelFilePath);
                                }
                                catch (e) {
                                    if (modelSpecified) {
                                        throw new Error("[mvcx] The specified request model '" + modelRoute.requestModel + "' was not accessible at '" + requestModelFilePath + "'. Please check whether the file exists and is accessible.")
                                    }
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
        let route = {
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
        if (isEmpty(controllerModule.$mvcx)) {
            controllerModule.$mvcx = self._mvcxConfig;
        }
        else{
            controllerModule.$mvcx = self._merge.recursive(true, self._mvcxConfig, controllerModule.$mvcx);
        }

        if(isEmpty(controllerModule.$mvcx.actions)){
            controllerModule.$mvcx.actions = {};
        }
        
        let extensions = {};
        let path = require('path');

        if (controllerModule.$mvcx.controllerType === 'mvc') {
            extensions.view = function (view, model) {
                if (view.indexOf('/') == -1) {
                    view = path.join(controllerModuleName.substring(0, controllerModuleName.length - self._mvcxConfig.controllerSuffix.length), view);
                }

                return new self._responseTypes.ViewResponse(view, model);
            };
        }
        else if(controllerModule.$mvcx.controllerType !== 'api'){
            throw new Error('[mvcx] Invalid controller type ' + controllerModule.$mvcx.controllerType + ' found for controller ' + controllerModuleName + '.');
        }

        extensions.redirect = function (route) {
            return new self._responseTypes.RedirectResponse(route);
        }

        extensions.file = function (filePath, options) {
            return new self._responseTypes.FileResponse(filePath, options);
        }

        extensions.download = function (filePath, downloadedFilename) {
            return new self._responseTypes.DownloadResponse(filePath, downloadedFilename);
        }

        extensions.stream = function (stream) {
            return new self._responseTypes.StreamResponse(stream);
        }

        extensions.void = function () {
            return new self._responseTypes.VoidResponse();
        }

        extensions.response = function () {
            return new self._responseTypes.Response();
        }

        controllerModule.prototype.mvcx = extensions;        
    }

    function extendAction(controllerModule, actionName) {
        if(isEmpty(controllerModule.$mvcx.actions[actionName])){
            controllerModule.$mvcx.actions[actionName] = {
                request: {}
            };
        }

        if(isEmpty(controllerModule.$mvcx.actions[actionName].request)){
            controllerModule.$mvcx.actions[actionName].request = {};
        }

        if(isEmpty(controllerModule.$mvcx.actions[actionName].request.createModel)){
            controllerModule.$mvcx.actions[actionName].request.createModel = createRequestModel;
        }

        if(isEmpty(controllerModule.$mvcx.actions[actionName].request.validate)){
            controllerModule.$mvcx.actions[actionName].request.validate = validateRequest;
        }

        let controllerAction = controllerModule.prototype[actionName];
        controllerModule.prototype[actionName] = function (model, req, res, next) {
            return controllerAction(model, req, res, next);
        }
    }

    function registerControllerBasedRoute(route, controllerModule) {
        let iocContainer = self._mvcxConfig.hooks.ioc;

        let url = require('url');
        let formattedRoute = url.resolve(url.resolve(url.resolve('/', self._mvcxConfig.baseUrlPrefix), '/'), route.route);

        self._logger.info('[mvcx] Registering controller action ' + route.controller + '.' + route.action + ' with route ' + formattedRoute + '...');
        self._express[route.method](formattedRoute, function (req, res, next) {
            let controller = iocContainer.resolve(route.controller);
            invokeControllerAction(route, controller, controllerModule, req, res, next);
        });
    }

    function registerViewBasedRoute(method, route, view) {
        self._logger.info('[mvcx] Registering view ' + view + ' with route ' + route + '...');
        self._express[method](route, function (req, res, next) {
            res.render(view);
        });
    }

    function invokeControllerAction(route, controller, controllerModule, req, res, next) {
        try {            
            self._q.Promise(function(resolve, reject){
                try{
                    controllerModule.$mvcx.actions[route.action].request.validate(req, function(requestValidationError){
                        try{
                            if(requestValidationError){
                                reject(requestValidationError);
                            }
                            else{
                                resolve();
                            }
                        }
                        catch(error){
                            reject(error);
                        }
                    });
                }
                catch(error){
                    reject(error);
                }
            }).then(function(){
                return self._q.Promise(function(resolve, reject){
                    try{
                        controllerModule.$mvcx.actions[route.action].request.createModel(req, function(modelCreationError, model){
                            try{
                                if(modelCreationError){
                                    reject(modelCreationError);
                                }
                                else{
                                    resolve(model);
                                }
                            }
                            catch(error){
                                reject(error);
                            }
                        }, controllerModule.$mvcx.requestModelMergeOrder);
                    }
                    catch(error){
                        reject(error);
                    }
                });
            }).then(function(model){
                return self._q.Promise(function(resolve, reject){
                    try{
                        controller[route.action](model, function(error, result){
                            try{
                                if(error){
                                    reject(error);
                                } else {
                                    resolve(result);
                                }
                            } 
                            catch(error){
                                reject(error);
                            } 
                        }, req, res, next);
                    }
                    catch(error){
                        reject(error);
                    }
                });                
            }).then(function(result){
                createSuccessResponse(controllerModule.$mvcx.controllerType, result, res);
            }).catch(function(error){
                createErrorResponse(controllerModule.$mvcx.controllerType, error, res);
            }).done();           
        }
        catch (error) {
            createErrorResponse(controllerModule.$mvcx.controllerType, error, res);
        }
    }

    function validateRequest(req, onCompleted){
        onCompleted(null);
    }

    function createRequestModel(req, onCompleted, requestModelMergeOrder){
        try{
            let requestModel = {};
            for(let i=0; i < requestModelMergeOrder.length; i++){
                requestModel = self._merge.recursive(true, requestModel, req[requestModelMergeOrder[i]]);
            }
            
            onCompleted(null, requestModel);
        }
        catch(error){
            onCompleted(error, null);
        }
    }

    function createSuccessResponse(controllerType, response, res) {
        if (typeof(response) === 'undefined') {
            createErrorResponse(controllerType, new Error('[mvcx] Controller action did not return a response.'), res);
        }
        else {
            if (response == null || response instanceof self._responseTypes.VoidResponse) {
                res.status(200);
            }
            else if (response instanceof self._responseTypes.ViewResponse) {
                if (response.model == null) {
                    res.render(response.view);
                }
                else {
                    res.render(response.view, response.model);
                }
            }
            else if (response instanceof self._responseTypes.DownloadResponse) {
                if (response.downloadedFilename == null) {
                    res.download(response.filePath);
                }
                else {
                    res.download(response.filePath, response.downloadedFilename);
                }
            }
            else if (response instanceof self._responseTypes.FileResponse) {
                if (response.options == null) {
                    res.sendFile(response.filePath);
                }
                else {
                    res.sendFile(response.filePath, response.options)
                }
            }
            else if (response instanceof self._responseTypes.RedirectResponse) {
                if (response.status == null) {
                    res.redirect(response.route);
                }
                else {
                    res.redirect(response.status, response.route);
                }
            }
            else if (response instanceof self._responseTypes.StreamResponse) {
                res.setHeader("content-type", response.contentType);
                res.stream.pipe(res);
            }
            else if (response instanceof self._responseTypes.Response) {
                response.handler(res);
            }
            else {
                res.status(200).json(response);
            }
        }
    }

    function createErrorResponse(controllerType, e, res) {
        let errorHandlerHook = self._mvcxConfig.hooks.errorHandlers[controllerType];

        if (isEmpty(errorHandlerHook)) {
            throw new Error('[mvcx] No error handler specified for controller type ' + controllerType + '.');
        }

        let hookOptions = {
            response: res,
            error: e,
            includeErrorStackInResponse: self._mvcxConfig.includeErrorStackInResponse
        };
        errorHandlerHook.createResponse(self._appConfig, hookOptions);
    }

    function registerAsset(express, route, assetConfig) {
        let fingerprintQueryKey = '__fingerprint';
        let rdType = typeof(assetConfig);
        if (rdType === 'string') {
            let path = require('path');
            let assetFile = path.resolve(assetConfig);
            fingerprintAsset(express, route, [assetFile], fingerprintQueryKey);
            express.get(route, function (req, res) {
                res.sendFile(assetFile);
            });
        }
        else if (assetConfig !== null && rdType === 'object') {

            if (typeof(assetConfig['browserify']) !== 'undefined' && assetConfig['browserify'] !== null) {
                let browserifyConfig = assetConfig['browserify'];
                let browserifyModules = browserifyConfig['modules'];
                if (typeof(browserifyModules) !== 'undefined' && browserifyModules !== null) {
                    let browserify = require('browserify-middleware');
                    browserify.settings.mode = 'production';

                    let browserifyOptions = browserifyConfig['options'];
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
                        fingerprintAsset(express, route, source, fingerprintQueryKey);
                        return source;
                    };

                    express.get(route, browserify(browserifyModules, browserifyOptions));
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

    function fingerprintAsset(express, route, filesOrData, query) {
        let Uri = require('urijs');
        let url = new Uri(route);

        let fingerprint = '';
        if (typeof(filesOrData) !== 'undefined' && filesOrData !== null) {
            if (Array.isArray(filesOrData) && filesOrData.length > 0) {
                let hashFiles = require('hash-files');
                fingerprint = hashFiles.sync({files: filesOrData, algorithm: 'md5'});
            }
            else if (typeof(filesOrData) === 'string' && filesOrData.length > 0) {
                let crypto = require('crypto');
                fingerprint = crypto.createHash('md5').update(filesOrData).digest('hex');
            }
            else {
                throw new Error('[mvcx] Invalid content encountered for asset ' + route + '.');
            }

            if (fingerprint !== null && fingerprint.length > 0) {
                url.addQuery(query, fingerprint);
            }
        }

        express.locals.mvcx.assets[route] = url.toString();
    }
};