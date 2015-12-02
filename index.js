module.exports = function(configMetadata){
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

  this.initialize = function(){
    return self.q.Promise(function(resolve, reject, notify) {
      try{
        console.log('info: [mvcx] Initializing...');

        if(self.mvcxConfig.clusteringEnabled) {
            var cluster = require('cluster');
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
          express: self.expressApp,
          config: self.appConfig
        };

        return resolve(result);
      }
      catch(e){
        var failureMessage = '[mvcx] Intialization failed.';
        if(self.logger != null){
          self.logger.error(failureMessage);
        }
        else{
          console.log(failureMessage);
        }

        reject(e);
      }
    });
  };

  this.loadRoutes = function(){
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
        var controllerType = 'mvc';
        if(!isEmpty(controller.module.$type)){
          controllerType = controller.module.$type;
        }

        iocContainer.register(controller.moduleName, controller.module, 'perRequest');

        var routeForGetDefined = false;
        var routeForPutDefined = false;
        var routeForPostDefined = false;
        var routeForDeleteDefined = false;
        if(routeIndex.controllerBasedRoutes.has(controller.moduleName)){
          var explicitRouteMethods = routeIndex.controllerBasedRoutes.get(controller.moduleName);
          routeForGetDefined = explicitRouteMethods.has('get');
          routeForPutDefined = explicitRouteMethods.has('put');
          routeForPostDefined = explicitRouteMethods.has('post');
          routeForDeleteDefined = explicitRouteMethods.has('delete');

          self.lazyjs(explicitRouteMethods.values()).each(function(routesArray){
            self.lazyjs(routesArray).each(function(route){
              registerControllerBasedRoute(route.method, route.route, controllerType, route.controller, route.action);
            });
          });
        }

        if(self.mvcxConfig.autoRoutesEnabled){
          if(!routeForGetDefined) registerControllerBasedRoute('get', controller.modulePrefix, controllerType, controller.moduleName, 'get');
          if(!routeForPutDefined) registerControllerBasedRoute('put', controller.modulePrefix, controllerType, controller.moduleName, 'put');
          if(!routeForPostDefined) registerControllerBasedRoute('post', controller.modulePrefix, controllerType, controller.moduleName, 'post');
          if(!routeForDeleteDefined) registerControllerBasedRoute('delete', controller.modulePrefix, controllerType, controller.moduleName, 'delete');
        }
      });

      self.lazyjs(routeIndex.viewBasedRoutes).each(function(route){
        registerViewBasedRoute(route.method, route.route, route.view);
      });
    }

    self.logger.info('[mvcx] Loading routes completed.');
  };

  this.createHttpServer = function() {
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating http server...');

    var http = self.mvcxConfig.hooks.ioc.resolve('http').value;
    var server  = http.createServer(self.expressApp);

    self.logger.info('[mvcx] Http server created.');

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

    return server;
  };

  this.createWebSocketServer = function(server){
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating web socket (socket.io) server...');

    var socketio = self.mvcxConfig.hooks.ioc.resolve('socket.io').value;
    return socketio(server);

    self.logger.info('[mvcx] Web socket server created.');
  }

  function initializeCore(){
      self.logger = initializeLogging();

      initializeIoc();

      self.expressApp = initializeExpress();

      self.logger.info('[mvcx] Intialization completed.');

      self.isInitializationSuccessful = true;
  }

  function mergeConfig(configMetadata) {
    var environment;
    var config;
    console.log('info: [mvcx] Initializing configuration...');

    var baseConfig = configMetadata.baseConfig;
    if (typeof(baseConfig) === 'undefined' || baseConfig == null) {
        baseConfig = {};
    }

    var merge = require('merge');

    console.log('info: [mvcx] Checking environment configuration indicator...');
    var environment = null;
    if(!isEmpty(configMetadata.environmentIndicatorVariable)){
      environment = process.env[configMetadata.environmentIndicatorVariable];
    }

    if (!isEmpty(environment)) {
        console.log('info: [mvcx] Loading configuration override for ' + environment + ' environment.');
        var overrideConfig = require(configMetadata.environmentConfigs[environment]);
        if (!(overrideConfig)) {
            throw new Error('[mvcx] The ' + env + ' environment configuration override is missing.');
        }

        console.log('info: [mvcx] Merging configuration override for ' + environment + ' environment...');
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
    config.mvcx = merge.recursive(true, require('./DefaultConfig'), overriddenMvcxConfig);

    var path = require('path');
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

    var express = require('express');
    var expressApp = express();

    var ioc = self.mvcxConfig.hooks.ioc;
    ioc.register('express', { value: express }, 'singleton'),
    ioc.register('expressApp', { value: expressApp }, 'singleton'),
    ioc.register('config', { value: self.appConfig }, 'singleton'),
    ioc.register('logger', { value: self.logger }, 'singleton'),
    ioc.register('q', { value: self.q }, 'singleton'),
    ioc.register('compression', { value: require('compression') }, 'singleton'),
    ioc.register('body-parser', { value: require('body-parser') }, 'singleton'),
    ioc.register('http', { value: require('http') }, 'singleton'),
    ioc.register('socket.io', { value: require('socket.io') }, 'singleton')
    ioc.register('merge', { value: require('merge') }, 'singleton')
    ioc.register('lazy.js', { value: require('lazy.js') }, 'singleton')
    ioc.register('hashmap', { value: require('hashmap') }, 'unique')
    ioc.register('connect-assets', { value: require('connect-assets') }, 'singleton')

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

    if(isEmpty(self.mvcxConfig.assets)){
      self.logger.info('[mvcx] Assets are disabled.');
    }
    else {
      self.logger.info('[mvcx] Registering assets...');
      var assets = iocContainer.resolve('connect-assets').value;
      expressApp.use(assets(self.mvcxConfig.assets));
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
    var viewBasedRoutes = [];

    if(!isEmpty(self.mvcxConfig.routes)){
      self.lazyjs(self.mvcxConfig.routes).each(function(route){
        if(!isEmpty(route.controller)){
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
      viewBasedRoutes: viewBasedRoutes
    };
  }

  function registerControllerBasedRoute(method, route, controllerType, controllerName, actionName){
    var iocContainer = self.mvcxConfig.hooks.ioc;
    var controllerMetadata = iocContainer.resolve(controllerName);

    if(!isEmpty(controllerMetadata[actionName])){
      var path = require('path');
      route = path.join('/', self.mvcxConfig.baseUrlPrefix, '/', route);

      self.logger.info('[mvcx] Registering controller action ' + controllerName + '.' + actionName + ' with route ' + route + '...');
      self.expressApp[method](route, function(req, res, next){
        var controller = iocContainer.resolve(controllerName);

        if(controllerType === 'mvc'){
          controller.view = function(view, model){
            if(view.indexOf('/') == -1){
              view = path.join(controllerName.substring(0, controllerName.length - self.mvcxConfig.controllerSuffix.length), view);
            }

            return new self.responseTypes.ViewResponse(view, model);
          };
        }

        controller.redirect = function(route){
          return new self.responseTypes.RedirectResponse(route);
        }

        controller.file = function(filePath, options){
          return new self.responseTypes.FileResponse(filePath, options);
        }

        controller.download = function(filePath, downloadedFilename){
          return new self.responseTypes.DownloadResponse(filePath, downloadedFilename);
        }

        controller.stream = function(stream){
          return new self.responseTypes.StreamResponse(stream);
        }

        controller.void = function(){
          return new self.responseTypes.VoidResponse();
        }

        controller.response = function(){
          return new self.responseTypes.Response();
        }

        invokeControllerAction(controllerType, controller[actionName], req, res, next);
      });
    }
  }

  function registerViewBasedRoute(method, route, view){
    self.logger.info('[mvcx] Registering view ' + view + ' with route ' + route + '...');
    self.expressApp[method](route, function(req, res, next){
      res.render(view);
    });
  }

  function invokeControllerAction(controllerType, action, req, res, next){
    try{
      var result = action(req, res, next);
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
};
