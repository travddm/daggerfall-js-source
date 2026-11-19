-- A Marks line debits its payer in an AFTER trigger. That UPDATE changes nothing when the payer has no balance row, and
-- under INSERT OR IGNORE a short payer's balance CHECK is ignored while the payee is still credited. Every caller checks
-- the balance first, but the schema did not, so one that skipped its check would create Marks. These BEFORE triggers
-- refuse such a line, and RAISE(ABORT) stops the statement under OR IGNORE as well.
CREATE TRIGGER marks_line_account_payer_holds BEFORE INSERT ON marks_ledger WHEN NEW.src_kind = 'account'
BEGIN
  SELECT RAISE(ABORT, 'marks payer short') WHERE COALESCE((SELECT balance FROM marks WHERE account = NEW.src_id), 0) < NEW.amount;
END;
CREATE TRIGGER marks_line_guild_payer_holds BEFORE INSERT ON marks_ledger WHEN NEW.src_kind = 'guild'
BEGIN
  SELECT RAISE(ABORT, 'marks payer short') WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = NEW.src_id), 0) < NEW.amount;
END;
-- An account or guild end with no id would debit nothing or credit a balance row that names no one.
CREATE TRIGGER marks_line_ends_named BEFORE INSERT ON marks_ledger
WHEN (NEW.src_kind IN ('account', 'guild') AND NEW.src_id IS NULL) OR (NEW.dst_kind IN ('account', 'guild') AND NEW.dst_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'marks end unnamed');
END;
