import { validate } from 'class-validator';
import { IsSqlServerGuid } from './sql-server-guid.validator';

class PruebaGuid {
  @IsSqlServerGuid()
  id!: string;
}

describe('IsSqlServerGuid', () => {
  it('acepta uniqueidentifier históricos aunque no tengan versión RFC', async () => {
    const dto = new PruebaGuid();
    dto.id = '25A97602-B08A-F111-8D68-C0B883CD616B';
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rechaza texto que no tenga forma de GUID', async () => {
    const dto = new PruebaGuid();
    dto.id = 'producto-1';
    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
