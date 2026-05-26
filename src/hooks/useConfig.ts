import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useConfig(clave: string, defaultValue = ''): {
  valor: string;
  loading: boolean;
  refresh: () => void;
} {
  const [valor, setValor] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', clave)
      .maybeSingle();
    setValor(data?.valor ?? defaultValue);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clave]);

  return { valor, loading, refresh: load };
}

export async function setConfig(clave: string, valor: string): Promise<{ error: any }> {
  return supabase
    .from('configuracion')
    .upsert({ clave, valor, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
}
