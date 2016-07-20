module.exports = function(
    configMetadata,
    options
){
  var self = this;

  this.q = require('q');
  this.lazyjs = require('lazy.js');
  this.expressApp = null;
  this.logger = null;
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
  this.appConfig = mergeConfig(configMetadata);
  this.mvcxConfig = self.appConfig.mvcx;

  if(typeof(options) !== 'undefined' && options !== null){
    if(options.expressApp) {
      this.expressApp = options.expressApp;
    }
  }

  if(this.expressApp === null){
    var express = require('express');
    this.expressApp = express();
  }

  this.initialize = function(onCompleted){
    var cluster = null;
    self.q.Promise(function(resolve, reject, notify) {
      try{
        console.log('info: [mvcx] Initializing...');

        if(self.mvcxConfig.clusteringEnabled) {
            cluster = require('cluster');
            var http = require('http');
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
        else{
            console.log('info: [mvcx] Clustering is disabled.');
            initializeCore();
        }

        var result = {
          expressApp: self.expressApp,
          config: self.appConfig
        };

        resolve(result);
      }
      catch(e){
        reject(e);
      }
    }).then(function(result){
      if(cluster === null || !cluster.isMaster) {
        self.logger.info('[mvcx] Initialization completed.');
        onCompleted(null, result);
      }
    }).catch(function(e){
      var failureMessage = '[mvcx] Intialization failed.';
      if(self.logger != null){
        self.logger.error(failureMessage);
      }
      else{
        console.log(failureMessage);
      }
      onCompleted(e, null);
    }).done();
  };

  this.createHttpServer = function(options) {
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create http server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating http server...');

    var http = self.mvcxConfig.hooks.ioc.resolve('http').value;
    var server  = http.createServer(self.expressApp);

    self.logger.info('[mvcx] Http server created.');

    createServerCore(server);

    return server;
  };

  this.createHttpsServer = function(options) {
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create https server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating https server...');

    var https = self.mvcxConfig.hooks.ioc.resolve('https').value;
    var server  = https.createServer(options, self.expressApp);

    self.logger.info('[mvcx] Https server created.');

    createServerCore(server);

    return server;
  };

  this.createWebSocket = function(server){
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create web socket server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating web socket (socket.io) server...');

    var socketio = self.mvcxConfig.hooks.ioc.resolve('socket.io').value;
    return socketio(server);

    self.logger.info('[mvcx] Web socket server created.');
  }

  function createServerCore(server){
    server.on('connection', function (socket) {
      if(self.mvcxConfig.keepAliveTimeoutSeconds > 0) {
        //logger.debug('Connection opened. Setting keep alive timeout to %s seconds', config.keepAliveTimeoutSeconds);
        socket.setKeepAlive(true);
        socket.setTimeout(self.mvcxConfig.keepAliveTimeoutSeconds * 1000, function () {
          //logger.debug('Connection closed after exceeding keep alive timeout.');
        });
      }
      else{
        socket.setKeepAlive(false);
      }
    });

    if(self.mvcxConfig.keepAliveTimeoutSeconds > 0) {
      self.logger.info('[mvcx] Server connection keep-alive timeout set to %s seconds.', self.mvcxConfig.keepAliveTimeoutSeconds);
    }else {
      self.logger.info('[mvcx] Server connection keep-alive is disabled.');
    }
  }

  function initializeCore() {
    self.logger = initializeLogging();

    //Add any data to be utilized in ejs templates in expressApp.locals.mvcx
    self.expressApp.locals.mvcx = {};

    initializeIoc();

    initializeExpress();

    initializeAssets();

    initializeRoutes();

    self.isInitializationSuccessful = true;
  }

  function initializeAssets(){
    self.expressApp.locals.mvcx.assets = {};
    if(!isEmpty(self.mvcxConfig.assets)) {
      for (var route in self.mvcxConfig.assets) {
        if(self.mvcxConfig.assets.hasOwnProperty(route)) {
          var assetConfig = self.mvcxConfig.assets[route];
          registerAsset(self.expressApp, route, assetConfig);
        }
      }
    }
  }

  function initializeRoutes(){
    self.logger.info('[mvcx] Loading routes...');

    var ModuleLoader = require('./ModuleLoader');
    var moduleLoader = new ModuleLoader();
    var path = require('path');

    var controllers = moduleLoader.load(path.resolve(self.mvcxConfig.controllerPath), self.mvcxConfig.controllerSuffix);

    if(controllers == null){
      self.logger.info('[mvcx] No controllers were found.');
    }
    else{
      self.logger.info('[mvcx] Found ' + controllers.length + ' controller(s).');
      if(self.mvcxConfig.autoRoutesEnabled){
        self.logger.info('[mvcx] Automatic routing enabled.');
      }
      else{
        self.logger.info('[mvcx] Automatic routing disabled.');
      }

      var iocContainer = self.mvcxConfig.hooks.ioc;

      var routeIndex = createRouteIndex();
      self.lazyjs(controllers).each(function(controller){

        extendController(controller.moduleName, controller.module);
        if(routeIndex.controllerActionRoutes.has(controller.moduleName)){
          var actionsForController = routeIndex.controllerActionRoutes.get(controller.moduleName);
          self.lazyjs(actionsForController.keys()).each(function(action){
            extendAction(controller.module, action);
          });
        }

        iocContainer.register(controller.moduleName, controller.module, 'perRequest');

        var routeForGetDefined = false;
        var routeForPutDefined = false;
        var routeForPostDefined = false;
        var routeForDeleteDefined = false;
        var routeForPatchDefined = false;
        if(routeIndex.controllerBasedRoutes.has(controller.moduleName)){
          var explicitRouteMethods = routeIndex.controllerBasedRoutes.get(controller.moduleName);
          routeForGetDefined = explicitRouteMethods.has('get');
          routeForPutDefined = explicitRouteMethods.has('put');
          routeForPostDefined = explicitRouteMethods.has('post');
          routeForDeleteDefined = explicitRouteMethods.has('delete');
          routeForPatchDefined = explicitRouteMethods.has('patch');

          self.lazyjs(explicitRouteMethods.values()).each(function(routesArray){
            self.lazyjs(routesArray).each(function(route){
              registerControllerBasedRoute(route, controller.module.$type);
            });
          });
        }

        if(self.mvcxConfig.autoRoutesEnabled){
          if(!routeForGetDefined) registerControllerBasedRoute(createAutoRoute('get', controller), controller.module.$type);
          if(!routeForPutDefined) registerControllerBasedRoute(createAutoRoute('put', controller), controller.module.$type);
          if(!routeForPostDefined) registerControllerBasedRoute(createAutoRoute('post', controller), controller.module.$type);
          if(!routeForDeleteDefined) registerControllerBasedRoute(createAutoRoute('delete', controller), controller.module.$type);
          if(!routeForPatchDefined) registerControllerBasedRoute(createAutoRoute('patch', controller), controller.module.$type);
        }
      });

      self.lazyjs(routeIndex.viewBasedRoutes).each(function(route){
        registerViewBasedRoute(route.method, route.route, route.view);
      });
    }

    self.logger.info('[mvcx] Loading routes completed.');
  };

  function mergeConfig(configMetadata) {
    var environment;
    var config;
    console.log('info: [mvcx] Initializing configuration...');

    var baseConfig = configMetadata.baseConfig;
    if (typeof(baseConfig) === 'undefined' || baseConfig == null) {
        baseConfig = {};
    }

    var merge = require('merge');

    console.log('info: [mvcx] Checking current environment configuration indicator...');

    if (!isEmpty(configMetadata.currentConfig)) {
        console.log('info: [mvcx] Loading configuration override for ' + configMetadata.currentConfig + ' environment.');
        var overrideConfig = configMetadata.configs[configMetadata.currentConfig];
        if (!(overrideConfig)) {
            throw new Error('[mvcx] The ' + env + ' environment configuration override is missing.');
        }

        console.log('info: [mvcx] Merging configuration override for ' + configMetadata.currentConfig + ' environment...');
        config = merge.recursive(true, baseConfig, overrideConfig);
    }
    else {
        console.log('info: [mvcx] No environment indicator found. Continuing with the base configuration...');
        config = baseConfig;
    }

    var overriddenMvcxConfig = config.mvcx;
    if(isEmpty(overriddenMvcxConfig)){
      overriddenMvcxConfig = {};
    }

    console.log('info: [mvcx] Merging mvcx default configuration with specified overrides from the application configuration...');
    var path = require('path');
    config.mvcx = merge.recursive(true, require(path.join(__dirname, 'DefaultConfig')), overriddenMvcxConfig);

    if(!isEmpty(config.mvcx.assets) && !isEmpty(config.mvcx.assets.paths) && config.mvcx.assets.paths.length > 0){
      console.log('info: [mvcx] Resolving asset paths...');

      var assetPaths = [];
      self.lazyjs(config.mvcx.assets.paths).each(function(assetPath){
        assetPaths.push(path.resolve(assetPath));
      });
      config.mvcx.assets.paths = assetPaths;
    }

    config.internalViewPath = path.join(__dirname, 'views');

    console.log('info: [mvcx] Configuration initialized.');
    return config;
  }

  function isEmpty(val){
    return (typeof (val) === 'undefined' || val == null);
  }

  function initializeIoc(){
    self.logger.info('[mvcx] Registering dependencies...');

    var ioc = self.mvcxConfig.hooks.ioc;
    ioc.register('expressApp', { value: self.expressApp }, 'singleton');
    ioc.register('config', { value: self.appConfig }, 'singleton');
    ioc.register('logger', { value: self.logger }, 'singleton');
    ioc.register('q', { value: self.q }, 'singleton');
    ioc.register('compression', { value: require('compression') }, 'singleton');
    ioc.register('body-parser', { value: require('body-parser') }, 'singleton');
    ioc.register('http', { value: require('http') }, 'singleton');
    ioc.register('https', { value: require('https') }, 'singleton');
    ioc.register('socket.io', { value: require('socket.io') }, 'singleton');
    ioc.register('merge', { value: require('merge') }, 'singleton');
    ioc.register('lazy.js', { value: require('lazy.js') }, 'singleton');
    ioc.register('hashmap', { value: require('hashmap') }, 'unique');
    ioc.register('tv4', { value: require('tv4') }, 'singleton');

    self.logger.info('[mvcx] Dependency registration completed.');
  }

  function initializeExpress(){
    self.logger.info('[mvcx] Creating express app...');
    var path = require('path');
    var iocContainer = self.mvcxConfig.hooks.ioc;
    var expressApp = iocContainer.resolve('expressApp').value;
    expressApp.locals.config = self.appConfig;

    self.logger.info('[mvcx] Registering standard middleware...');

    if(isEmpty(self.mvcxConfig.viewEngine)){
      self.logger.info('[mvcx] No view engine specified.');
    }
    else{
      self.logger.info('[mvcx] Registering view engine...');
      expressApp.set('view engine', self.mvcxConfig.viewEngine);
      expressApp.set('views', path.resolve(self.mvcxConfig.viewPath));
    }

    if(self.mvcxConfig.compressionEnabled){
        var compress = iocContainer.resolve('compression').value;
        expressApp.use(compress());
        self.logger.info('[mvcx] Gzip compression is enabled.');
    }
    else{
        self.logger.info('[mvcx] Gzip compression is disabled.');
    }

    self.logger.info('[mvcx] Registering body parser with url encoding and json support...');
    var bodyParser  = iocContainer.resolve('body-parser').value;
    expressApp.use(bodyParser.urlencoded({ extended: false }));
    expressApp.use(bodyParser.json({limit:(self.mvcxConfig.requestLimitKB)+"kb"}));

    self.logger.info('[mvcx] Standard middleware registration completed.');

    return expressApp;
  }

  function initializeLogging(){
    var logger;

    var winston = require('winston');
    winston.emitErrs = true;

    var winstonTransports = [];
    if(self.mvcxConfig.loggerAppenders && self.mvcxConfig.loggerAppenders.length > 0){
        for(var i=0; i < self.mvcxConfig.loggerAppenders.length; i++){
            var appender = self.mvcxConfig.loggerAppenders[i];
            winstonTransports.push(new winston.transports[appender.type](appender.options));
        }
    }
    else{
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

  function createRouteIndex(){
    var Hashmap = self.mvcxConfig.hooks.ioc.resolve('hashmap').value;
    var controllerBasedRoutes = new Hashmap();
    var controllerActionRoutes = new Hashmap();
    var viewBasedRoutes = [];

    if(!isEmpty(self.mvcxConfig.routes)){
      self.lazyjs(self.mvcxConfig.routes).each(function(route){
        if(!isEmpty(route.controller)){
          if(!controllerActionRoutes.has(route.controller)){
            var actionsForController = new Hashmap();
            actionsForController.set(route.action, [route]);
            controllerActionRoutes.set(route.controller, actionsForController);
          }
          else{
            var actionsForController = controllerActionRoutes.get(route.controller);
            if(!actionsForController.has(route.action)){
              actionsForController.set(route.action, [route])
            }
            else{
              var routesArray = actionsForController.get(route.action);
              routesArray.push(route);
            }
          }

          if(!controllerBasedRoutes.has(route.controller)){
            var routeMethods = new Hashmap();
            routeMethods.set(route.method, [route]);
            controllerBasedRoutes.set(route.controller, routeMethods);
          }
          else{
            var controllerRoute = controllerBasedRoutes.get(route.controller);
            if(!controllerRoute.has(route.method)){
              controllerRoute.set(route.method, [route])
            }
            else{
              var routesArray = controllerRoute.get(route.method);
              routesArray.push(route);
            }
          }
        }
        else if(!isEmpty(route.view)){
          viewBasedRoutes.push(route);
        }
        else{
          throw new Error('[mvcx] Invalid route (' + route.route + ') encountered with no controller or view specified.')
        }
      });
    }

    return {
      controllerBasedRoutes: controllerBasedRoutes,
      viewBasedRoutes: viewBasedRoutes,
      controllerActionRoutes: controllerActionRoutes
    };
  }

  function createAutoRoute(method, controllerModule){
    var route = {
      method: method,
      route: '/' + controllerModule.modulePrefix,
      controller: controllerModule.moduleName,
      action: method
    };

    var requestModel = controllerModule.modulePrefix + method.charAt(0).toUpperCase() + method.substr(1) + self.mvcxConfig.requestModelSuffix;
    var path = require('path');
    var fs = require('fs');
    var modelPath = path.join(path.resolve(self.mvcxConfig.modelPath), requestModel + '.js')
    try{
      fs.statSync(modelPath);
      route.requestModel = requestModel;
    }
    catch(e){
      //File does not exist
    }

    return route;
  }

  function extendController(controllerModuleName, controllerModule){
    if(isEmpty(controllerModule.$type)){
      controllerModule.$type = self.mvcxConfig.controllerType;
    }

    var extensions = {};
    var path = require('path');

    if(controllerModule.$type === 'mvc'){
      extensions.view = function(view, model){
        if(view.indexOf('/') == -1){
          view = path.join(controllerModuleName.substring(0, controllerModuleName.length - self.mvcxConfig.controllerSuffix.length), view);
        }

        return new self.responseTypes.ViewResponse(view, model);
      };
    }

    extensions.redirect = function(route){
      return new self.responseTypes.RedirectResponse(route);
    }

    extensions.file = function(filePath, options){
      return new self.responseTypes.FileResponse(filePath, options);
    }

    extensions.download = function(filePath, downloadedFilename){
      return new self.responseTypes.DownloadResponse(filePath, downloadedFilename);
    }

    extensions.stream = function(stream){
      return new self.responseTypes.StreamResponse(stream);
    }

    extensions.void = function(){
      return new self.responseTypes.VoidResponse();
    }

    extensions.response = function(){
      return new self.responseTypes.Response();
    }

    controllerModule.prototype.mvcx = extensions;
  }

  function extendAction(controllerModule, actionName){
    var controllerAction = controllerModule.prototype[actionName];
    controllerModule.prototype[actionName] = function(model, req, res, next){
      console.log('Extended action called');
      return controllerAction(model, req, res, next);
    }
  }

  function registerControllerBasedRoute(route, controllerType){
    var iocContainer = self.mvcxConfig.hooks.ioc;
    var controllerMetadata = iocContainer.resolve(route.controller);

    if(!isEmpty(controllerMetadata[route.action])){
      var url = require('url');
      var formattedRoute = url.resolve(url.resolve(url.resolve('/', self.mvcxConfig.baseUrlPrefix), '/'), route.route);

      self.logger.info('[mvcx] Registering controller action ' + route.controller + '.' + route.action + ' with route ' + formattedRoute + '...');
      self.expressApp[route.method](formattedRoute, function(req, res, next){
        var controller = iocContainer.resolve(route.controller);
        invokeControllerAction(route, controller, controllerType, req, res, next);
      });
    }
  }

  function registerViewBasedRoute(method, route, view){
    self.logger.info('[mvcx] Registering view ' + view + ' with route ' + route + '...');
    self.expressApp[method](route, function(req, res, next){
      res.render(view);
    });
  }

  function invokeControllerAction(route, controller, controllerType, req, res, next){
    try{
      var merge = self.mvcxConfig.hooks.ioc.resolve('merge').value;
      var model = merge.recursive(true, req.query, req.params);
      model = merge.recursive(true, model, req.body);

      var result = controller[route.action](model, req, res, next);
      if(!isEmpty(result) && self.q.isPromise(result)){
        result.then(function(response){
          createSuccessResponse(controllerType, response, res);
        }).catch(function(e){
          createErrorResponse(controllerType, e, res);
        });
      }
      else{
        createSuccessResponse(controllerType, result, res);
      }
    }
    catch(e){
      createErrorResponse(controllerType, e, res);
    }
  }

  function createSuccessResponse(controllerType, response, res){
    if(typeof(response) === 'undefined'){
      createErrorResponse(controllerType, new Error('[mvcx] Controller action did not return a response.'), res);
    }
    else {
      if(response == null || response instanceof self.responseTypes.VoidResponse){
        res.status(200);
      }
      else if(response instanceof self.responseTypes.ViewResponse){
        if(response.model == null){
          res.render(response.view);
        }
        else{
          res.render(response.view, response.model);
        }
      }
      else if(response instanceof self.responseTypes.DownloadResponse){
        if(response.downloadedFilename == null){
          res.download(response.filePath);
        }
        else{
          res.download(response.filePath, response.downloadedFilename);
        }
      }
      else if(response instanceof self.responseTypes.FileResponse){
        if(response.options == null){
          res.sendFile(response.filePath);
        }
        else{
          res.sendFile(response.filePath, response.options)
        }
      }
      else if(response instanceof self.responseTypes.RedirectResponse){
        if(response.status == null){
          res.redirect(response.route);
        }
        else{
          res.redirect(response.status, response.route);
        }
      }
      else if(response instanceof self.responseTypes.StreamResponse){
        res.setHeader("content-type", response.contentType);
        res.stream.pipe(res);
      }
      else if(response instanceof self.responseTypes.Response){
        response.handler(res);
      }
      else {
        res.status(200).json(response);
      }
    }
  }

  function createErrorResponse(controllerType, e, res){
    var errorHandlerHook = self.mvcxConfig.hooks.errorHandlers[controllerType];

    if(isEmpty(errorHandlerHook)){
      throw new Error('[mvcx] No error handler specified for controller type ' + controllerType + '.');
    }

    var hookOptions = {
      response: res,
      error: e,
      includeErrorStackInResponse: self.mvcxConfig.includeErrorStackInResponse
    };
    errorHandlerHook.createResponse(self.appConfig, hookOptions);
  }

  function registerAsset(expressApp, route, assetConfig){
    var fingerprintQueryKey = '__fingerprint';
    var rdType = typeof(assetConfig);
    if(rdType === 'string'){
      var path = require('path');
      var assetFile = path.resolve(assetConfig);
      fingerprintAsset(expressApp, route, [assetFile], fingerprintQueryKey);
      expressApp.get(route, function(req, res){
        res.sendFile(assetFile);
      });
    }
    else if(assetConfig !== null && rdType === 'object'){

      if(typeof(assetConfig['browserify']) !== 'undefined' && assetConfig['browserify'] !== null){
        var browserifyConfig = assetConfig['browserify'];
        var browserifyModules = browserifyConfig['modules'];
        if(typeof(browserifyModules) !== 'undefined' && browserifyModules !== null){
          var browserify = require('browserify-middleware');
          browserify.settings.mode = 'production';

          var browserifyOptions = browserifyConfig['options'];
          if(typeof(browserifyOptions) === 'undefined' || browserifyOptions === null){
            browserifyOptions = {
              minify: false,
              gzip: false,
              debug: true
            };
          }
          browserifyOptions.mode = 'production';

          if(typeof(browserifyOptions.cache) === 'undefined'
              || browserifyOptions.cache === null
              || (typeof(browserifyOptions.cache) === 'boolean' && browserifyOptions.cache === false)
              || (typeof(browserifyOptions.cache) === 'string' && browserifyOptions.cache === '')){
            browserifyOptions.cache = 1000;
          }

          browserifyOptions.precompile = true;
          browserifyOptions.postcompile = function(source){
            fingerprintAsset(expressApp, route, source, fingerprintQueryKey);
            return source;
          };

          expressApp.get(route, browserify(browserifyModules, browserifyOptions));
        }
        else{
          throw new Error('[mvcx] Invalid route definition specified for asset ' + route + '.');
        }
      }
      else{
        throw new Error('[mvcx] Invalid route definition specified for asset ' + route + '.');
      }
    }
    else{
      throw new Error('[mvcx] Invalid route definition specified for asset ' + route + '.');
    }
  }

  function fingerprintAsset(expressApp, route, filesOrData, query){
    var Uri = require('urijs');
    var url = new Uri(route);

    var fingerprint = '';
    if(typeof(filesOrData) !== 'undefined' && filesOrData !== null){
      if(Array.isArray(filesOrData) && filesOrData.length > 0){
        var hashFiles = require('hash-files');
        fingerprint = hashFiles.sync({ files:filesOrData, algorithm:'md5' });
      }
      else if(typeof(filesOrData) === 'string' && filesOrData.length > 0){
        var crypto = require('crypto');
        fingerprint = crypto.createHash('md5').update(filesOrData).digest('hex');
      }
      else{
        throw new Error('[mvcx] Invalid content encountered for asset ' + route + '.');
      }

      if(fingerprint !== null && fingerprint.length > 0){
        url.addQuery(query, fingerprint);
      }
    }

    self.expressApp.locals.mvcx.assets[route] = url.toString();
  }
};
