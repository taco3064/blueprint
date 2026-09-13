import { BROWNFIELD_MIN_FILES } from '../bootstrap';
import { CLI_USAGE, renderCliCommandHelp } from '../operational-contract';

export const USAGE = CLI_USAGE;
export const COMMAND_HELP = renderCliCommandHelp({ brownfieldMinFiles: BROWNFIELD_MIN_FILES });
