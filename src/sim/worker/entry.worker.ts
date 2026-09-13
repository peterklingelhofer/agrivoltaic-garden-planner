import { registerSimWorker, type SimWorkerScope } from './entry'

registerSimWorker(self as unknown as SimWorkerScope)
