/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * vm.add task unit tests
 */

var h = require('./helpers');
var mod_cache = require('../lib/cache');
var mod_rule = require('../lib/rule');
var mod_uuid = require('node-uuid');
var mod_vm = require('../lib/vm');



// --- Globals



// Set this to any of the exports in this file to only run that test,
// plus setup and teardown
var runOne;
var agent;
var owners = [ mod_uuid.v4(), mod_uuid.v4() ];
var d = {
    cache: {},
    rules: [],
    rvms: [],
    vms: [ ]
};



// --- Setup



exports.setup = function (t) {
    h.createAgent(t, true, function (err, a) {
        agent = a;
        return t.done();
    });
};




// --- Tests



exports['add'] = {
    'setup': function (t) {
        d.rules = [
            h.rule({
                created_by: 'fwapi',
                description: 'allow pings to all VMs',
                global: true,
                rule: 'FROM any TO all vms ALLOW icmp TYPE 8 CODE 0'
            }),
            h.rule({
                created_by: 'fwapi',
                owner_uuid: owners[0],
                rule: 'FROM tag role = db TO tag role = www ALLOW tcp PORT 80'
            }),
            h.rule({
                created_by: 'fwapi',
                owner_uuid: owners[0],
                rule:
                    'FROM tag role = test TO tag role = qa ALLOW tcp PORT 8080'
            })
        ];

        d.vms = [
            h.vm(),
            h.vm({ owner_uuid: owners[0], tags: { role: 'db' } }),
            h.vm({ owner_uuid: owners[0] }),
            h.vm({ owner_uuid: owners[0], tags: { role: 'qa' } }),
            h.vm({ owner_uuid: owners[0], tags: { role: 'test' } })
        ];

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    'add global rule: no local VMs': function (t) {
        mod_rule.add(t, d.rules[0]);
    },

    // There are no local VMs, so the rules should not be added

    'after adding global rule': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    },

    'add tag rule: no local VMs': function (t) {
        mod_rule.add(t, d.rules[1]);
    },

    'after adding tag rule': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    },

    // There are no rules on this node, so the VM should not be added:

    'add vm': function (t) {
        mod_vm.add(t, d.vms[0]);
    },

    'after first vm.add': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    },

    'add local vm': function (t) {
        var vm = h.vm({
            local: true,
            owner_uuid: owners[0],
            tags: { role: 'www' }
        });
        // Should be d.vms[5]
        d.vms.push(vm);
        d.idx = d.vms.length - 1;

        var resolve = [
            {
                allVMs: false,
                owner_uuid: owners[0],
                rules: [ d.rules[0], d.rules[1] ],
                tags: {
                    role: 'db'
                },
                vms: []
            }
        ];
        h.set({
            fwapiRules: d.rules,
            resolve: resolve,
            vms: d.vms
        });

        mod_vm.add(t, vm);
    },

    // Adding this local VM should cause both rules to be added, as well as the
    // other (non-local) remote VM

    'after adding VM': function (t) {
        h.equalSorted(t, h.localRules(), [ d.rules[0], d.rules[1] ],
            'rules added');
        t.deepEqual(h.localRVMs(), [ h.vmToRVM(d.vms[1]) ],
            'remote VM added');

        mod_cache.addTag(d.cache, owners[0], 'role', 'db');
        t.deepEqual(agent.cache.cache, d.cache, 'tag role=db added to cache');
        t.equal(h.vmapiReqs().length, 1, '1 request made to VMAPI');

        var resolveReqs = h.fwapiReqs();
        d.resolve = [ {
            owner_uuid: owners[0],
            vms: [ d.vms[d.idx].uuid ],
            tags: {
                role: [ 'www' ]
            }
        } ];

        t.deepEqual(resolveReqs.resolve, d.resolve,
            'resolve request');

        return t.done();
    },

    // Update the local VM: this should add the rule that refers to the
    // new role, and the remote VMs from the other side of the rule

    'update local vm': function (t) {
        d.vms[d.idx].tags = { role: 'qa' };

        var resolve = [
            {
                allVMs: false,
                owner_uuid: owners[0],
                rules: [ d.rules[0], d.rules[2] ],
                tags: {
                    role: 'test'
                },
                vms: []
            }
        ];
        h.set({
            fwapiRules: d.rules,
            resolve: resolve,
            vms: d.vms
        });

        mod_vm.update(t, d.vms[d.idx]);
    },

    'after updating VM': function (t) {
        h.equalSorted(t, h.localRules(), d.rules, 'rules added');
        h.equalSorted(t, h.localRVMs(), h.vmToRVM([ d.vms[1], d.vms[4] ]),
            'remote VM added');

        mod_cache.addTag(d.cache, owners[0], 'role', 'test');
        t.deepEqual(agent.cache.cache, d.cache, 'tag role=test added to cache');
        t.equal(h.vmapiReqs().length, 2, '1 more request made to VMAPI');

        var resolveReqs = h.fwapiReqs();
        d.resolve.push({
            owner_uuid: owners[0],
            vms: [ d.vms[d.idx].uuid ],
            tags: {
                role: [ 'qa' ]
            }
        });

        t.deepEqual(resolveReqs.resolve, d.resolve,
            'one more resolve request made');

        return t.done();
    }
};


exports['firewall_enabled=false'] = {
    'setup': function (t) {
        h.reset();

        d.rules = [
            h.rule({
                created_by: 'fwapi',
                owner_uuid: owners[1],
                rule: 'FROM ip 10.0.1.1 TO tag internal ALLOW tcp PORT 80'
            })
        ];

        d.vms = [
            // local:
            h.vm({
                firewall_enabled: false,
                local: true,
                owner_uuid: owners[1],
                tags: { internal: true }
            }),
            // on another server:
            h.vm({
                firewall_enabled: false,
                owner_uuid: owners[1],
                tags: { internal: true }
            }),
            // owned by someone else:
            h.vm({ owner_uuid: owners[0], tags: { internal: true } }),
            h.vm()
        ];

        h.set({
            fwapiRules: d.rules,
            vms: d.vms
        });

        return t.done();
    },

    'add rule: no local VMs with firewall enabled': function (t) {
        mod_rule.add(t, d.rules[0]);
    },

    // There are no local VMs, so the rules should not be added

    'after adding global rule': function (t) {
        t.deepEqual(h.localRules(), [], 'rule not added');
        t.deepEqual(h.localRVMs(), [], 'no remote VMs added');

        return t.done();
    }
};


exports['vmadm list error'] = function (t) {
    var errMsg = 'ENOENT: something';
    mod_vm.setListError(new Error(errMsg));
    mod_vm.add(t, h.vm(), function (err) {
        t.ok(err, 'error returned');
        if (err) {
            t.equal(err.message, errMsg, 'error message');
        }

        return t.done();
    });
};



// --- Teardown



exports.teardown = function (t) {
    h.teardown(t);
};



// Use to run only one test in this file:
if (runOne) {
    module.exports = {
        setup: exports.setup,
        oneTest: runOne,
        teardown: exports.teardown
    };
}
