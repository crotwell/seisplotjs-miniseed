
// this comes from the seisplotjs miniseed bundle
var miniseed = seisplotjs_miniseed;


var client = new XMLHttpRequest();
var url = 'http://service.iris.edu/fdsnws/dataselect/1/query?net=CO&sta=JSC&loc=00&cha=HHZ&start=2017-03-01T20:17:04&end=2017-03-01T20:22:04';

var div = d3.select('div.miniseed');
div.append('p').text(url);

client.open("GET", url);
client.onreadystatechange = handler;
client.responseType = "arraybuffer";
client.setRequestHeader("Accept", "application/vnd.fdsn.mseed");
client.send();

function handler() {
  if (this.readyState === this.DONE) {
    if (this.status === 200) {
console.log("resolve miniseed: ");
      resolve(this.response); }
    else { reject(this); }
  }
}

var resolve = function(arraybuf) {
  var records = miniseed.parseDataRecords(arraybuf);
var table = d3.select("div.miniseed")
        .select("table");
      if ( table.empty()) {
        table = d3.select("div.miniseed")
          .append("table");
        var th = table.append("thead").append("tr");
        th.append("th").text("Seq");
        th.append("th").text("Net");
        th.append("th").text("Sta");
        th.append("th").text("Loc");
        th.append("th").text("Chan");
        th.append("th").text("Start");
        th.append("th").text("End");
        th.append("th").text("NumSamp");
        th.append("th").text("Sps");
        table.append("tbody");
      }
      var tableData = table.select("tbody")
        .selectAll("tr")
        .data(records, function(d) { return d.codes()+d.header.start;});
      tableData.exit().remove();
      var tr = tableData.enter().append('tr');
      tr.append("td")
        .text(function(d) {
          return d.header.seq;
        });
      tr.append("td")
        .text(function(d) {
          return d.header.netCode;
        });
      tr.append("td")
        .text(function(d) {
          return d.header.staCode;
        });
      tr.append("td")
        .text(function(d) {
          return d.header.locCode;
        });
      tr.append("td")
        .text(function(d) {
          return d.header.chanCode;
        });
      tr.append("td")
        .text(function(d) {
          return d.header.start.toISOString();
        });
      tr.append("td")
        .text(function(d) {
          return d.header.end.toISOString();
        });
      tr.append("td")
        .text(function(d) {
          return d.header.numSamples;
        });
      tr.append("td")
        .text(function(d) {
          return d.header.sampleRate;
        });
}

var reject = function(error) {
  d3.select("div.miniseed").append('p').html("Error loading data." +error);
  console.assert(false, error);
}
