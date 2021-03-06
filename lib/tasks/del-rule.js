/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Delete firewall rule task
 */

var fw = require('../fw');
var mod_vm = require('../vm');



function delRule(opts, callback) {
    opts.log.debug(opts.value, 'Deleting rule');
    var filter = {};
    if (opts.value.owner_uuid) {
        filter.owner_uuid = opts.value.owner_uuid;
    }

    mod_vm.list(opts.log, filter, function (err, vms) {
        if (err) {
            return callback(err);
        }

        var delPayload = {
            req_id: opts.req_id,
            log: opts.log,
            payload: {
                uuids: [ opts.value.uuid ],
                vms: vms
            }
        };

        fw.del(delPayload, function (err2, res2) {
            if (err2) {
                return callback(err2);
            }

            // XXX: need to remove remote VMs from the cache if they're
            // unused

            callback(null, res2);
        });
    });
}


module.exports = {
    run: delRule
};
