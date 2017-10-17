
var fs = require('fs');

QUnit.test("load miniseed file", function (assert) {
    assert.ok(true, "this test is fine");

    var mseedData = fs.readFileSync('test/CO_JSC.mseed');
    assert.equal(7168, mseedData.length, "file size, data size");
    var parsed = parseDataRecords(mseedData.buffer);
    assert.equal(14, parsed.length, "14 data records");
    assert.equal("JSC", parsed[0].header.staCode, "Station is JSC");
    var decomp = parsed[0].decompress();
    assert.ok(true, "data decompressed without error");
});
