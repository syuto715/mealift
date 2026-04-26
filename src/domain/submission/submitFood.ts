import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  UserSubmittedFood,
  UserSubmittedFoodInput,
} from '../../types/userSubmittedFood';
import type { ConsentVersion } from '../../types/userConsent';
import { getConsentStatus } from '../../infra/repositories/userConsentRepository';
import { createSubmission } from '../../infra/repositories/userSubmittedFoodRepository';
import { ConsentRequiredError } from './errors';

// submitFood — domain-level orchestration that gates createSubmission
// behind an active food_submission consent.
//
// Why here and not inside the repository? The repository is the
// CRUD primitive — it should not know about the legal/consent
// surface. Mixing the two there means every test of the repo also
// has to mock consent. Keeping the gate at the domain layer also
// means moderator tooling (which writes submissions on behalf of
// other actors and shouldn't trip the user-consent rule) can call
// the repository directly without a workaround.
//
// Validation note: this function does NOT call validateSubmission.
// The UI runs the validator eagerly for inline errors, and the
// validator is exposed as its own gate. If a future code path needs
// a server-side enforcement layer, layer it on top of this — don't
// fold validation into the consent gate.
export async function submitFood(
  db: SQLiteDatabase,
  input: UserSubmittedFoodInput,
  foodSubmissionConsentVersion: ConsentVersion,
): Promise<UserSubmittedFood> {
  const status = await getConsentStatus(
    db,
    'food_submission',
    foodSubmissionConsentVersion,
  );
  if (!status.hasActive) {
    throw new ConsentRequiredError(foodSubmissionConsentVersion);
  }
  return createSubmission(db, input);
}
