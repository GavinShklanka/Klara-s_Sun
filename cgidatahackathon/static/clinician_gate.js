/**
 * Clinician gate — demo-safe access. Production: OAuth / SAML / provincial identity.
 */
(function () {
    'use strict';

    var DEMO_PASSWORDS = ['KlaraOS', 'NovaScotia811', 'QEII-Halifax', 'HalifaxPilot'];

    function unlockClinician() {
        var input = document.getElementById('clinician-password');
        var pass = (input && input.value) ? input.value.trim() : '';
        if (!pass) {
            alert('Please enter an access key.');
            return;
        }
        if (DEMO_PASSWORDS.indexOf(pass) !== -1) {
            window.location.href = '/admin';
        } else {
            alert('Access denied.');
        }
    }

    var form = document.getElementById('clinician-gate-form');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            unlockClinician();
        });
    }
})();
