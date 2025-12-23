function escape (key, val) {
  if (typeof(val)!="string") return val;
  return val      
      .replace(/[\\\\]/g, '\\')
      .replace(/\//g, '\/')
      .replace(/[\b]/g, '\\b')
      .replace(/[\f]/g, '\\f')
      .replace(/[\n]/g, '\\n')
      .replace(/[\r]/g, '\\r')
      .replace(/[\t]/g, '\\t')
      .replace(/[\"]/g, '\\"')
      .replace(/\\'/g, "\\'"); 
}


function requestHandler() {}
requestHandler.prototype = {
  parse: function (req) {
    // $.writeln(req)
    var res=req;
    if (typeof req == "string") {
      try{
        res=JSON.parse(unescape (decodeURIComponent (req)));
      }catch(err){
        alert(err)
        try{
          res=eval(req)
        }catch(err){
          alert(err)
        }
      }
    }else {
        return req
    }
    return res
  },
  toString: function (res) {
    return JSON.stringify(res);
  },
  args: {
    get: function (obj, key) {
      var obj_key = obj[key];
      if (obj_key) return obj_key;
      else {
        return {};
      } //add warning
    },
    push: function () {},
  },
  error: {
    find: function () {},
    push: function () {},
  },
};
var RH = new requestHandler();
