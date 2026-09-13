'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const PermissionProfile = Object.freeze({
  OBSERVE: 'observe',
  EDIT: 'edit',
  DEVELOPER: 'developer',
  TRUSTED_AUTOMATION: 'trusted-automation',
});

const Decision = Object.freeze({
  ALLOW: 'allow',
  REQUIRE_APPROVAL: 'require-approval',
  DENY: 'deny',
});

const Risk = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const Capability = Object.freeze({
  FS_READ: 'fs.read',
  FS_WRITE: 'fs.write',
  FS_DELETE: 'fs.delete',
  SHELL_READONLY: 'shell.readonly',
  SHELL_EXEC: 'shell.exec',
  GIT_READ: 'git.read',
  GIT_WRITE: 'git.write',
  NETWORK: 'network',
  DESTRUCTIVE: 'destructive',
  SECRET_READ: 'secret.read',
});

const PROFILE_CAPABILITIES = Object.freeze({
  [PermissionProfile.OBSERVE]: new Set([
    Capability.FS_READ,
    Capability.SHELL_READONLY,
    Capability.GIT_READ,
  ]),
  [PermissionProfile.EDIT]: new Set([
    Capability.FS_READ,
    Capability.FS_WRITE,
    Capability.SHELL_READONLY,
    Capability.GIT_READ,
  ]),
  [PermissionProfile.DEVELOPER]: new Set([
    Capability.FS_READ,
    Capability.FS_WRITE,
    Capability.FS_DELETE,
    Capability.SHELL_READONLY,
    Capability.SHELL_EXEC,
    Capability.GIT_READ,
    Capability.GIT_WRITE,
    Capability.NETWORK,
  ]),
  [PermissionProfile.TRUSTED_AUTOMATION]: new Set([
    Capability.FS_READ,
    Capability.FS_WRITE,
    Capability.FS_DELETE,
    Capability.SHELL_READONLY,
    Capability.SHELL_EXEC,
    Capability.GIT_READ,
    Capability.GIT_WRITE,
    Capability.NETWORK,
    Capability.DESTRUCTIVE,
  ]),
});

const ALWAYS_APPROVE = new Set([
  Capability.FS_DELETE,
  Capability.GIT_WRITE,
  Capability.NETWORK,
  Capability.DESTRUCTIVE,
  Capability.SECRET_READ,
]);

function normalizeProfile(profile) {
  const value = String(profile || '').trim().toLowerCase();
  if (!PROFILE_CAPABILITIES[value]) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `unknown permission profile: ${profile}`, { profile });
  }
  return value;
}

function profileAllows(profile, capability) {
  const normalized = normalizeProfile(profile);
  return PROFILE_CAPABILITIES[normalized].has(capability);
}

function defaultRiskFor(capability) {
  if ([Capability.SECRET_READ, Capability.DESTRUCTIVE].includes(capability)) return Risk.CRITICAL;
  if ([Capability.FS_DELETE, Capability.GIT_WRITE, Capability.NETWORK].includes(capability)) return Risk.HIGH;
  if ([Capability.FS_WRITE, Capability.SHELL_EXEC].includes(capability)) return Risk.MEDIUM;
  return Risk.LOW;
}

function evaluatePermission(input = {}) {
  const profile = normalizeProfile(input.profile || PermissionProfile.OBSERVE);
  const capability = String(input.capability || '').trim();
  if (!capability) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'tool capability is required');

  const declaredRisk = input.risk || defaultRiskFor(capability);
  const caps = PROFILE_CAPABILITIES[profile];
  if (!caps.has(capability)) {
    return {
      decision: Decision.DENY,
      profile,
      capability,
      risk: declaredRisk,
      reason: `Permission profile '${profile}' does not grant ${capability}.`,
      approvalRequired: false,
    };
  }

  const forcedApproval = ALWAYS_APPROVE.has(capability)
    || declaredRisk === Risk.CRITICAL
    || input.forceApproval === true;
  if (forcedApproval) {
    return {
      decision: Decision.REQUIRE_APPROVAL,
      profile,
      capability,
      risk: declaredRisk,
      reason: `Operation ${capability} requires explicit approval under profile '${profile}'.`,
      approvalRequired: true,
    };
  }

  if (declaredRisk === Risk.HIGH && profile !== PermissionProfile.TRUSTED_AUTOMATION) {
    return {
      decision: Decision.REQUIRE_APPROVAL,
      profile,
      capability,
      risk: declaredRisk,
      reason: `High-risk ${capability} operation requires explicit approval.`,
      approvalRequired: true,
    };
  }

  return {
    decision: Decision.ALLOW,
    profile,
    capability,
    risk: declaredRisk,
    reason: `Permission profile '${profile}' allows ${capability}.`,
    approvalRequired: false,
  };
}

function assertApproved(decision, approval = {}) {
  if (!decision || !decision.decision) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'permission decision is required');
  }
  if (decision.decision === Decision.DENY) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, decision.reason || 'tool operation denied', { decision });
  }
  if (decision.decision === Decision.REQUIRE_APPROVAL) {
    const accepted = approval && approval.approved === true;
    const decisionIdMatches = !approval.decisionId || !decision.id || approval.decisionId === decision.id;
    if (!accepted || !decisionIdMatches) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, 'explicit approval is required for this tool operation', {
        decision,
      });
    }
  }
  return true;
}

module.exports = {
  PermissionProfile,
  Decision,
  Risk,
  Capability,
  PROFILE_CAPABILITIES,
  ALWAYS_APPROVE,
  normalizeProfile,
  profileAllows,
  defaultRiskFor,
  evaluatePermission,
  assertApproved,
};
