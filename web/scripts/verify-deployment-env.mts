import { auditDeploymentEnvironment } from "../src/domain/deployment-env";

const audit = auditDeploymentEnvironment(process.env);
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
if (!audit.ok) process.exitCode = 1;
