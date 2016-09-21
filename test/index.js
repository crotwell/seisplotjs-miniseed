
var fs = require('fs');

test("load miniseed file", function () {
    ok(true, "this test is fine");
    
    var mseedData = fs.readFileSync('test/CO_JSC.mseed');
    equal(7168, mseedData.length, "file size, data size");
    var parsed = parseDataRecords(mseedData.buffer);
    equal(14, parsed.length, "14 data records");
    equal("JSC", parsed[0].header.staCode, "Station is JSC");
    var decomp = parsed[0].decompress();
    ok(true, "data decompressed without error");
});

