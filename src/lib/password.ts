/** Senha forte (s.10): pelo menos 10 caracteres, com letras e números. */
export function passwordAcceptable(password: string): boolean {
  return password.length >= 10 && /[A-Za-zÀ-ž]/.test(password) && /\d/.test(password);
}

/** Primeira senha gerada pela gestão (entregue pessoalmente, trocada no primeiro acesso). */
export function generateTemporaryPassword(random: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string) => set[random(set.length)];
  const chars = [pick(digits), pick(digits)];
  while (chars.length < 12) chars.push(pick(letters + digits));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
