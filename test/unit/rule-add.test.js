/*
 * Copyright (c) 2014, Joyent, Inc. All rights reserved.
 *
 * add-rule task unit tests
 */

var fmt = require('util').format;
var h = require('./helpers');
var mod_cache = require('../lib/cache');
var mod_rule = require('../lib/rule');
var mod_uuid = require('node-uuid');
var mod_vm = require('../lib/vm');
var util = require('util');




// --- Globals



var agent;
var owners = [ mod_uuid.v4() ];
var d = {
    exp: {
        cache: {},
        rules: [],
        rvms: []
    },
    rules: [],
    rvms: [],
    vms: []
};



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, true, function (err, a) {
        agent = a;
        return t.done();
    });
};



// --- Tests



/*
 * Send an empty rule - this should be ignored by the agent
 */
exports['missing rule sent'] = function (t) {
    d.vms = [];
    d.rules = [];

    h.set({
        fwapiRules: d.rules,
        vms: d.vms
    });

    h.send('fw.add_rule', null, function (msg) {
        // A message received event will not be emitted, since the message
        // should be ignored
        t.ok(!msg, 'message not received');

        mod_rule.localEquals(t, d.exp.rules, 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');
        t.deepEqual(agent.cache.cache, d.exp.cache, 'cache empty');

        return t.done();
    });
};


exports['multiple tags'] = {
    'setup': function (t) {
        d.vms = [
            // Local VM
            h.vm({ owner_uuid: owners[0], local: true, tags: { couch: 1 } }),
            h.vm({ owner_uuid: owners[0], tags: { couch: 2 } })
        ];

        d.rules = [
            h.rule({
                created_by: 'fwapi',
                enabled: true,
                owner_uuid: owners[0],
                rule: 'FROM (tag couch = 1 OR tag couch = 2) TO ' +
                    '(tag couch = 1 OR tag couch = 2) ALLOW tcp PORT 5984'
            })
        ];

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    // There are no VMs matching any tags in the rule, so it should not
    // be added
    'add rule: vm 0 local': function (t) {
        mod_rule.add(t, d.rules[0], function (err, msg) {
            if (err) {
                return t.done();
            }

            d.exp.rules = [ d.rules[0] ];
            d.exp.rvms = [ h.vmToRVM(d.vms[1]) ];

            mod_rule.localEquals(t, d.exp.rules, 'rule added');
            t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VM 1 added');

            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '1');
            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '2');
            t.deepEqual(agent.cache.cache, d.exp.cache, 'tags cached');

            t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');
            t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
                owner_uuid: owners[0],
                tags: [
                    [ 'couch', '1' ],
                    [ 'couch', '2' ]
                ]
            }), 'VMAPI request');
            return t.done();
        });
    },

    // Now set vms[1] as the local VM

    'reset': function (t) {
        d.vms = [
            h.vm({ owner_uuid: owners[0], tags: { couch: 1 } }),
            // Local VM
            h.vm({ owner_uuid: owners[0], local: true, tags: { couch: 2 } })
        ];

        h.reset();
        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });
        agent.cache.clear();

        mod_rule.localEquals(t, [], 'rule removed by reset');
        t.deepEqual(h.localRVMs(), [], 'remote VMs removed by reset');
        return t.done();
    },

    'add rule: vm 1 local': function (t) {
        mod_rule.add(t, d.rules[0], function (err, msg) {
            if (err) {
                return t.done();
            }

            d.exp.rules = [ d.rules[0] ];
            d.exp.rvms = [ h.vmToRVM(d.vms[0]) ];

            mod_rule.localEquals(t, d.exp.rules, 'rule added');
            t.deepEqual(h.localRVMs(), d.exp.rvms, 'remote VM 1 added');

            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '1');
            mod_cache.addTag(d.exp.cache, owners[0], 'couch', '2');
            t.deepEqual(agent.cache.cache, d.exp.cache, 'tags cached');

            t.equal(h.vmapiReqs().length, 2, 'second request made to VMAPI');
            t.deepEqual(h.lastVmapiReq(), h.vmapiReq({
                owner_uuid: owners[0],
                tags: [
                    [ 'couch', '1' ],
                    [ 'couch', '2' ]
                ]
            }), 'VMAPI request');
            return t.done();
        });
    }
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};