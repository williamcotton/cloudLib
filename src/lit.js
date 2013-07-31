(function(root) {
  
  var hostname = "www.corslit.com";
  var GITHUB_OAUTH_CLIENT_ID = "f497d63f8657e29d73cc";
  
  if (window.location.hostname == "localhost" || typeof(LIT_DEV) != "undefined") {
    hostname = "localhost:" + 5000;
    GITHUB_OAUTH_CLIENT_ID = "b1f2f347b61ebc0794d0";
  }
  
  var host_url = "http://" + hostname;
  
  root.LIT_HOSTNAME = host_url;
  
  var pollUrl = function(url, success, failure) {
    var pollInterval = setInterval(function() {
      var pollRequest = new XMLHttpRequest();
      pollRequest.open("get", url, true);
      pollRequest.onload = function(request) {
        success(request);
        clearInterval(pollInterval);
      };
      pollRequest.withCredentials = true;
      pollRequest.send();
    }, 500);
  };
  
  define("lit", {
    load: function (name, req, onload, config) {

      var evaluator = function(request) {
        
        //console.log(request.target.response);

        var lit_pack = JSON.parse(request.target.response);
        var callback_string = lit_pack.callback;
        
        /*
        
        For right now it just uses eval instead of say, the RequireJS script loading approach.
        This will probably change, I'm just trying to only solve problems when they need to be solved
        
        The three newlines ("\n\n\n") that you see below are to get the lines numbers to match
        the source code editor.
        
        */
        
        var sourceMap = "//# sourceURL=" + name;
        var callback = eval("(\n\n\n" + callback_string + ")" + sourceMap);
        // EVAL IS EVIL!
        

        var deps_json = lit_pack.deps;
        var deps = [];

        var initiated_callback;

        
        if (deps_json) {
          deps_json.forEach(function(dep_json) {
            deps.push(JSON.parse(dep_json));
          });
        }
        else {
          deps = [];
        }
        
        //try { 
          
          initiated_callback = callback.apply(this, deps);
          onload(initiated_callback);
        //}
        //catch(err) {
          // tie this in to the source code editor somehow...
        //  console.log(err.stack);
        //}

      };

      var dataRequest = new XMLHttpRequest();
      dataRequest.onload = evaluator;
      
      var url = host_url + "/v0/" + name;

      dataRequest.withCredentials = true;
      dataRequest.open("get", url, true);
      dataRequest.send();

    }
  });
  
  var litLogin = function() {
    
    var login_button = document.createElement("div");
    login_button.classList.add("login");
    document.body.appendChild(login_button);
    
    var secret_oauth_lookup = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
    
    var loginWithCode = function(code) {
      var loginRequest = new XMLHttpRequest();
      loginRequest.open("get", host_url + '/oauth_token?code=' + code, true);
      loginRequest.onload = function(request) {
        var github_details = JSON.parse(request.target.response);
        console.log(github_details);
      };
      loginRequest.withCredentials = true;
      loginRequest.send();
    };
    
    var pollForOAuthCode = function() {
      pollUrl(host_url + '/oauth_poll/' + secret_oauth_lookup, function(request) {
        var code = request.target.response;
        if (code) {
          loginWithCode(code);
        }
      });
    };
    
    var listenForWindowMessage = function() {
      window.addEventListener('message', function (event) {
        var code = event.data;
        loginWithCode(code);
      });
    };
    
    var openGithubOAuthWindow = function() {
      window.open('https://github.com' + 
        '/login/oauth/authorize' + 
        '?client_id=' + GITHUB_OAUTH_CLIENT_ID +
        '&redirect_uri=' + host_url + "/login/" + secret_oauth_lookup +
        '&scope=gist');
    };
    
    var authorizeWithGithub = function() {
      openGithubOAuthWindow();
      if (window.location.host == hostname) {
        listenForWindowMessage();
      }
      else {
        pollForOAuthCode();
      }
    }
    
    login_button.addEventListener("click", function() {
      authorizeWithGithub();
    });
    
  };

  var lit = function(package_definition, name, deps, callback) {

    if (typeof name !== 'string' && !!deps) {
      // we need a name, due to issues with anonymously defined modules in requireJS
      // which is fine, because lit's need a name as well!
      define(package_definition.name, name, deps);
    }
    else {
      define(name, deps, callback);
    }

    if (typeof name !== 'string') {
        //Adjust args appropriately
        callback = deps;
        deps = name;
        name = null;
    }

    //This module may not have dependencies
    if (typeof(deps.sort) != "function") {
        callback = deps;
        deps = null;
    }

    var storelit = function(name, lit_pack_json) {

      var data = new FormData();
      data.append('name', name);
      data.append('lit_pack_json', lit_pack_json);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', host_url + "/v0", true);
      xhr.onload = function () {
        console.log(this.responseText);
      };
      xhr.onerror = function(error) {
        console.log(error, this);
      };
      xhr.withCredentials = true;
      xhr.send(data);

    };

    if (deps && deps.length) {

      var dep_count = deps.length;
      var string_deps = [];

      var store = function() {
        var lit_pack = {
          package_definition: JSON.stringify(package_definition),
          deps: string_deps,
          callback: callback.toString()
        };
        storelit(package_definition.name, JSON.stringify(lit_pack));
      };

      // right now this only has one level of dependencies... it needs to search for deps recursively at some point
      deps.forEach(function(dep) {
        require([dep], function(m) {

          dep_count--;
          m_s = typeof(m) == "function" ? m.toString() : JSON.stringify(m);

          string_deps.push(m_s);

          if (dep_count === 0) {
            store();
          }
        });
      });

    }
    else {
      var lit_pack = {
        package_definition: JSON.stringify(package_definition),
        callback: callback.toString()
      };
      storelit(package_definition.name, JSON.stringify(lit_pack));
    }

  };
  
  lit.test = function(test_definition, callback) {
    
    var litName;
    if (test_definition["for"].indexOf("/") > -1) {
      litName = test_definition["for"].split("/")[1];
    }
    else {
      litName = test_definition["for"];
    }
    
    var testName = litName + "-test";
    
    lit({name: testName}, [], callback);
    
    var pathName = window.location.pathname.split("/")[1] + "/" + litName;
    
    require(["lit!" + pathName], callback);
    
  };
  
  root.lit = lit;
  
  litLogin();
  
})(this);