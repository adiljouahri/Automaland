function logger(name_user) {
  var folder_log =
    Folder.myDocuments.fsName.replace(/\\/g, "/") + "/" + name_user;
  if (!Folder(folder_log).exists) {
    Folder(folder_log).create();
  }

  this.log_path = File(folder_log + "/log.log");
  if (this.log_path.exists) this.log_path.remove();
  this.log("log Extendscript inited");
}
logger.prototype.log = function (msg, event) {
  try {
    var today = new Date();
    var date =
      today.getFullYear() +
      "-" +
      (today.getMonth() + 1) +
      "-" +
      today.getDate();
    var time =
      today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    var dateTime = date + " " + time;

    var f = this.log_path;
    f.encoding = "UTF-8";
    f.open("a");
    f.writeln(
      "ExtendScript: " +
        dateTime +
        ":  " +
        (event ? event : " INFO ") +
        " ====> " +
        msg
    );
    f.close();
  } catch (e) {}
};
var LOGGER = new logger("AutomlandtApp");
