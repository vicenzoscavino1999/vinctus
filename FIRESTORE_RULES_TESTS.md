# Firestore Security Rules - Smoke Tests

## Manual Testing Checklist

Estos son los tests mínimos que **DEBEN** pasar/fallar para validar las Security Rules.

### ✅ Tests que DEBEN PASAR

| # | Test | Location | Auth | Expected |
|---|------|----------|------|----------|
| 1 | Usuario A lee sus propios likes | `users/A/likes/post1` | Si (uid: A) | ✅ Allow |
| 2 | Usuario A crea su propio like | `users/A/likes/post1` | Si (uid: A) | ✅ Allow |
| 3 | Usuario A borra su propio like | `users/A/likes/post1` | Si (uid: A) | ✅ Allow |
| 4 | Usuario A crea membership en grupo | `users/A/memberships/group1` | Si (uid: A) | ✅ Allow |
| 5 | Usuario A crea member en grupo | `groups/group1/members/A` | Si (uid: A) | ✅ Allow |
| 6 | Usuario A crea like en post | `posts/post1/likes/A` | Si (uid: A) | ✅ Allow |
| 7 | Usuario A borra member de grupo | `groups/group1/members/A` | Si (uid: A) | ✅ Allow |
| 8 | Usuario anónimo lee grupos | `groups/group1` | No | ✅ Allow |
| 9 | Usuario anónimo lee posts | `posts/post1` | No | ✅ Allow |
| 10 | Usuario anónimo lee members | `groups/group1/members/A` | No | ✅ Allow |
| 11 | **Usuario A hace update idempotente a su like** | `users/A/likes/post1` | Si (uid: A) | ✅ Allow |
| 12 | **Usuario A hace update idempotente a su membership** | `groups/group1/members/A` | Si (uid: A) | ✅ Allow |

### ❌ Tests que DEBEN FALLAR

| # | Test | Location | Auth | Expected |
|---|------|----------|------|----------|
| 1 | Usuario A escribe en users/B | `users/B/likes/post1` | Si (uid: A) | ❌ Deny |
| 2 | Usuario A crea member B en grupo | `groups/group1/members/B` | Si (uid: A) | ❌ Deny |
| 3 | Usuario A crea like de B en post | `posts/post1/likes/B` | Si (uid: A) | ❌ Deny |
| 4 | Cualquier write sin auth | `users/A/likes/post1` | No | ❌ Deny |
| 5 | Usuario A lee savedPosts de B | `users/B/savedPosts/post1` | Si (uid: A) | ❌ Deny |
| 6 | Usuario A lee savedCategories de B | `users/B/savedCategories/cat1` | Si (uid: A) | ❌ Deny |
| 7 | Usuario anónimo crea like | `users/anon/likes/post1` | No | ❌ Deny |
| 8 | Usuario anónimo crea membership | `users/anon/memberships/group1` | No | ❌ Deny |
| 9 | **Usuario A intenta cambiar role a admin** | `groups/group1/members/A` | Si (uid: A) | ❌ Deny |
| 10 | **Usuario A intenta escribir uid=B en su doc** | `posts/post1/likes/A` | Si (uid: A) | ❌ Deny |

## Cómo Ejecutar los Tests

### Opción 1: Firebase Console Rules Playground

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Proyecto: **vinctus-daf32**
3. Firestore Database → **Rules** → **Rules Playground** (pestaña)
4. Para cada test:
   - **Location**: Copia el path del test
   - **Simulate**: Selecciona Get/Create/Delete según el test
   - **Authenticated**: Marca según el test
   - **Auth UID**: Ingresa el uid del test (A, B, anon, etc.)
   - **Data** (para creates): 
   ```json
   {
     "groupId": "group1",
     "joinedAt": "2024-01-01T00:00:00Z"
   }
   ```
5. Click **Run**
6. Verifica que el resultado coincida con **Expected**

### Opción 2: Firebase Emulator (Recomendado)

**Setup:**
```bash
# Instalar Firebase CLI si no la tienes
npm install -g firebase-tools

# Login
firebase login

# Inicializar emulators
firebase init emulators
# Selecciona: Firestore, Authentication
```

**Ejecutar tests:**
```bash
# Crear archivo de tests (ver abajo)
npm run test:firestore-rules

# O manualmente
firebase emulators:start --only firestore
# Luego ejecuta los tests en otro terminal
```

## Script de Test Automatizado (Opcional)

Si quieres automatizar, crea `firestore.rules.test.ts`:

```typescript
import { 
  assertFails, 
  assertSucceeds, 
  initializeTestEnvironment 
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vinctus-test',
    firestore: {
      rules: require('fs').readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Security Rules - User Data', () => {
  it('✅ Usuario A puede crear su propio like', async () => {
    const db = testEnv.authenticatedContext('userA').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/userA/likes/post1'), {
        postId: 'post1',
        createdAt: new Date(),
      })
    );
  });

  it('❌ Usuario A NO puede escribir en users/B', async () => {
    const db = testEnv.authenticatedContext('userA').firestore();
    await assertFails(
      setDoc(doc(db, 'users/userB/likes/post1'), {
        postId: 'post1',
        createdAt: new Date(),
      })
    );
  });

  it('❌ Usuario anónimo NO puede crear like', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'users/anon/likes/post1'), {
        postId: 'post1',
        createdAt: new Date(),
      })
    );
  });
});

describe('Security Rules - Groups', () => {
  it('✅ Usuario anónimo puede leer grupos', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'groups/group1')));
  });

  it('❌ Usuario A NO puede crear member B', async () => {
    const db = testEnv.authenticatedContext('userA').firestore();
    await assertFails(
      setDoc(doc(db, 'groups/group1/members/userB'), {
        uid: 'userB',
        groupId: 'group1',
        role: 'member',
        joinedAt: new Date(),
      })
    );
  });
});
```

**package.json:**
```json
{
  "scripts": {
    "test:firestore-rules": "firebase emulators:exec --only firestore 'vitest run firestore.rules.test.ts'"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^3.0.0"
  }
}
```

## Resultado Esperado

**Al finalizar, debes tener:**
- ✅ 10 tests PASANDO
- ❌ 8 tests FALLANDO (como se espera)

**Si algún test no coincide con lo esperado**, las rules tienen un bug y deben corregirse.

## Validación Rápida en Producción

Después de deployar las rules, puedes verificar rápidamente desde la app:

```typescript
// En la consola del navegador, autenticado como Usuario A:

// ✅ Debe funcionar
await joinGroupWithSync('group1', 'user_A_uid');

// ❌ Debe fallar con "Missing or insufficient permissions"
const fakeDB = getFirestore();
const fakeRef = doc(fakeDB, 'users/otro_usuario_uid/likes/post1');
await setDoc(fakeRef, { postId: 'post1', createdAt: new Date() });
```

## Notas Importantes

1. **serverTimestamp()**: Las rules NO validan `is timestamp` en creates porque `serverTimestamp()` es un sentinel, no un timestamp literal. Esto es correcto y esperado.

2. **merge: true**: Las rules permiten `update` condicional (solo si campos críticos no cambian) para soportar `batch.set()` idempotente con merge.

3. **Public reads**: `groups` y `posts` son públicos para discovery. Solo `users/{uid}/saved*` son privados.

4. **Immutability**: Aunque permitimos `update`, validamos que campos críticos (`uid`, `groupId`, `postId`) no cambien. Esto da flexibilidad para idempotencia sin sacrificar seguridad.
