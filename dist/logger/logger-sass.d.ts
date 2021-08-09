import { BuildContext, Diagnostic } from '../util/interfaces';
import { SassError } from 'sass';
export declare function runSassDiagnostics(context: BuildContext, sassError: SassError): Diagnostic[];
