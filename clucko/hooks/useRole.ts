import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export const useRole = () => {
  const [role, setRole] = useState<string>("owner");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("user_role").then((r) => {
      setRole(r || "owner");
      setLoading(false);
    });
  }, []);

  const isOwner = role === "owner";
  const isCaretaker = role === "caretaker";

  return { role, isOwner, isCaretaker, loading };
};
