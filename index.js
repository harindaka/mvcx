module.exports = function(){

  this.start = function(mvcxConfig, done){
    try{
      console.log('info: [mvcx] Initializing...');
      if(mvcxConfig.clusteringEnabled) {
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
              return initializeCore(mvcxConfig, done);
          }
      }
      else{
          console.log('info: [mvcx] Clustering is disabled.');
          return initializeCore(mvcxConfig, done);
      }
    }
    catch(e){
      done(e, null);
    }
  };

  function initializeCore(mvcxConfig, done){
    try
    {
      var appConfig = null;

      initializeLogging(mvcxConfig);
      var iocContainer = initializeIoc(mvcxConfig, appConfig, logger);

      done(null, appConfig);
    }
    catch(e){
      done(e, null);
    }
  }

  function initializeIoc(mvcxConfig, appConfig, logger){
    var dependencyResolver = mvcxConfig.dependencyResolver;

    var intravenous = require('intravenous');
    var container = intravenous.create();
    container.register('config', appConfig, 'singleton');
    container.register('logger', logger, 'singleton');

    logger.info('[mvcx] Registering dependencies...');

  }

  function initializeLogging(mvcxConfig){
    var logger;
    var environmentDescriptor;
    try{
        var winston = require('winston');
        winston.emitErrs = true;

        var winstonTransports = [];
        if(mvcxConfig.loggerAppenders && mvcxConfig.loggerAppenders.length > 0){
            for(var i=0; i < mvcxConfig.loggerAppenders.length; i++){
                var appender = mvcxConfig.loggerAppenders[i];
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
    }
    catch(e){
        console.log(e);
        throw e;
    }
  }
};
