module.exports = (function(){
    var MvcxApp = require('./index');
    var app = new MvcxApp();

    var mvcxConfig = {
      clusteringEnabled: false,
      compressionEnabled: true,
      requestLimitKB: 5120,
      loggerAppenders: [
          {
              type: "Console",
              options: {
                  level: "silly",
                  timestamp: true,
                  handleExceptions: false,
                  json: false,
                  colorize: true,
                  prettyPrint: true
              }
          }
      ]
    };

    app.start(mvcxConfig, function(err, result){
      if(err){
        throw err;
      }
      else{
        console.log('initialization complete');
      }
    });
})();
