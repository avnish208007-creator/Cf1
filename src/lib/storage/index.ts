export * from './repository.interface';
export * from './local-storage.repository';
export * from './firestore.repository';

import { FirestoreRepository } from './firestore.repository';
export const repository = new FirestoreRepository();
