import { Toaster as Sonner, type ToasterProps } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleInfo, faCircleXmark, faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

function Toaster(props: ToasterProps) {
  return <Sonner theme="system" className="toaster" icons={{
    success: <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" />,
    info: <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />,
    warning: <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />,
    error: <FontAwesomeIcon icon={faCircleXmark} aria-hidden="true" />,
    loading: <FontAwesomeIcon icon={faSpinner} className="animate-spin" aria-hidden="true" />,
  }} toastOptions={{ classNames: { toast: "cn-toast" } }} {...props} />;
}

export { Toaster };
