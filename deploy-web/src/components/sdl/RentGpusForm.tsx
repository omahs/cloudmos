import {
  Alert,
  Box,
  Button,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  useTheme
} from "@mui/material";
import { useForm, Controller } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { ITemplate, RentGpusFormValues, Service } from "@src/types";
import { defaultAnyRegion, defaultRentGpuService } from "@src/utils/sdl/data";
import { useRouter } from "next/router";
import Link from "next/link";
import { useSnackbar } from "notistack";
import sdlStore from "@src/store/sdlStore";
import { useAtom } from "jotai";
import { useProviderAttributesSchema } from "@src/queries/useProvidersQuery";
import { makeStyles } from "tss-react/mui";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import InfoIcon from "@mui/icons-material/Info";
import { CustomTooltip } from "../shared/CustomTooltip";
import Image from "next/legacy/image";
import { useSdlDenoms } from "@src/hooks/useDenom";
import { RegionSelect } from "./RegionSelect";
import { AdvancedConfig } from "./AdvancedConfig";
import { GpuFormControl } from "./GpuFormControl";
import { CpuFormControl } from "./CpuFormControl";
import { MemoryFormControl } from "./MemoryFormControl";
import { StorageFormControl } from "./StorageFormControl";
import { generateSdl } from "@src/utils/sdl/sdlGenerator";
import { UrlService, handleDocClick } from "@src/utils/urlUtils";
import { RouteStepKeys, defaultInitialDeposit } from "@src/utils/constants";
import { deploymentData } from "@src/utils/deploymentData";
import { useCertificate } from "@src/context/CertificateProvider";
import { useSettings } from "@src/context/SettingsProvider";
import { useWallet } from "@src/context/WalletProvider";
import { validateDeploymentData } from "@src/utils/deploymentUtils";
import { generateCertificate } from "@src/utils/certificateUtils";
import { TransactionMessageData } from "@src/utils/TransactionMessageData";
import { updateWallet } from "@src/utils/walletUtils";
import { saveDeploymentManifestAndName } from "@src/utils/deploymentLocalDataUtils";
import { DeploymentDepositModal } from "../deploymentDetail/DeploymentDepositModal";
import { LinkTo } from "../shared/LinkTo";
import { PrerequisiteList } from "../newDeploymentWizard/PrerequisiteList";
import { useTemplates } from "@src/context/TemplatesProvider";
import { ProviderAttributeSchemaDetailValue } from "@src/types/providerAttributes";

const yaml = require("js-yaml");

type Props = {};

const useStyles = makeStyles()(theme => ({
  formControl: {
    marginBottom: theme.spacing(1.5)
  },
  textField: {
    width: "100%"
  }
}));

export const RentGpusForm: React.FunctionComponent<Props> = ({}) => {
  const theme = useTheme();
  const { classes } = useStyles();
  const [error, setError] = useState(null);
  // const [templateMetadata, setTemplateMetadata] = useState<ITemplate>(null);
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);
  const [isDepositingDeployment, setIsDepositingDeployment] = useState(false);
  const [isCheckingPrerequisites, setIsCheckingPrerequisites] = useState(false);
  const formRef = useRef<HTMLFormElement>();
  const [, setDeploySdl] = useAtom(sdlStore.deploySdl);
  const [rentGpuSdl, setRentGpuSdl] = useAtom(sdlStore.rentGpuSdl);
  const { data: providerAttributesSchema } = useProviderAttributesSchema();
  const { enqueueSnackbar } = useSnackbar();
  const {
    handleSubmit,
    reset,
    control,
    formState: { isValid },
    trigger,
    watch,
    setValue
  } = useForm<RentGpusFormValues>({
    defaultValues: {
      services: [{ ...defaultRentGpuService }],
      region: { ...defaultAnyRegion }
    }
  });
  const { services: _services, region: _region } = watch();
  const router = useRouter();
  const supportedSdlDenoms = useSdlDenoms();
  const currentService: Service = _services[0] || ({} as any);
  const { settings } = useSettings();
  const { address, signAndBroadcastTx } = useWallet();
  const { loadValidCertificates, localCert, isLocalCertMatching, loadLocalCert, setSelectedCertificate } = useCertificate();
  const [sdlDenom, setSdlDenom] = useState("uakt");
  const { isLoading: isLoadingTemplates, categories, templates } = useTemplates();

  useEffect(() => {
    if (rentGpuSdl && rentGpuSdl.services) {
      setValue("services", structuredClone(rentGpuSdl.services));
      setValue("region", rentGpuSdl.region || { ...defaultAnyRegion });

      // Set the value of gpu models specifically because nested value doesn't re-render correctly
      // https://github.com/react-hook-form/react-hook-form/issues/7758
      setValue("services.0.profile.gpuModels", rentGpuSdl.services[0].profile.gpuModels || []);
    }

    const subscription = watch(({ services, region }) => {
      setRentGpuSdl({ services: services as Service[], region: region as ProviderAttributeSchemaDetailValue });
    });
    return () => subscription.unsubscribe();
  }, []);

  async function createAndValidateDeploymentData(yamlStr, dseq = null, deposit = defaultInitialDeposit, depositorAddress = null) {
    try {
      if (!yamlStr) return null;

      const doc = yaml.load(yamlStr);
      const dd = await deploymentData.NewDeploymentData(settings.apiEndpoint, doc, dseq, address, deposit, depositorAddress);
      validateDeploymentData(dd);

      setSdlDenom(dd.deposit.denom);

      return dd;
    } catch (err) {
      console.error(err);
    }
  }

  const onPrerequisiteContinue = () => {
    setIsCheckingPrerequisites(false);
    setIsDepositingDeployment(true);
  };

  const onDeploymentDeposit = async (deposit: number, depositorAddress: string) => {
    setIsDepositingDeployment(false);
    await handleCreateClick(deposit, depositorAddress);
  };

  const onSubmit = async (data: RentGpusFormValues) => {
    setRentGpuSdl(data);
    setIsCheckingPrerequisites(true);
  };

  async function handleCreateClick(deposit: number, depositorAddress: string) {
    setError(null);

    try {
      const sdl = generateSdl(rentGpuSdl.services, rentGpuSdl.region.key);
      // setDeploySdl({
      //   title: "",
      //   category: "",
      //   code: "",
      //   description: "",
      //   content: sdl
      // });

      // console.log(sdl);

      setIsCreatingDeployment(true);

      const dd = await createAndValidateDeploymentData(sdl, null, deposit, depositorAddress);
      const validCertificates = await loadValidCertificates();
      const currentCert = validCertificates.find(x => x.parsed === localCert?.certPem);
      const isCertificateValidated = currentCert?.certificate?.state === "valid";
      const isLocalCertificateValidated = !!localCert && isLocalCertMatching;

      if (!dd) return;

      const messages = [];
      const hasValidCert = isCertificateValidated && isLocalCertificateValidated;
      let _crtpem: string;
      let _encryptedKey: string;

      // Create a cert if the user doesn't have one
      if (!hasValidCert) {
        const { crtpem, pubpem, encryptedKey } = generateCertificate(address);
        _crtpem = crtpem;
        _encryptedKey = encryptedKey;
        messages.push(TransactionMessageData.getCreateCertificateMsg(address, crtpem, pubpem));
      }

      messages.push(TransactionMessageData.getCreateDeploymentMsg(dd));
      const response = await signAndBroadcastTx(messages);

      if (response) {
        // Set the new cert in storage
        if (!hasValidCert) {
          updateWallet(address, wallet => {
            return {
              ...wallet,
              cert: _crtpem,
              certKey: _encryptedKey
            };
          });
          const validCerts = await loadValidCertificates();
          loadLocalCert();
          const currentCert = validCerts.find(x => x.parsed === _crtpem);
          setSelectedCertificate(currentCert);
        }

        setDeploySdl(null);

        // Save the manifest
        saveDeploymentManifestAndName(dd.deploymentId.dseq, sdl, dd.version, address, currentService.image);
        router.push(UrlService.newDeployment({ step: RouteStepKeys.createLeases, dseq: dd.deploymentId.dseq }));

        // event(AnalyticsEvents.CREATE_DEPLOYMENT, {
        //   category: "deployments",
        //   label: "Create deployment in wizard"
        // });
      } else {
        setIsCreatingDeployment(false);
      }
    } catch (error) {
      setIsCreatingDeployment(false);
      setError(error.message);
    }
  }

  return (
    <>
      {isDepositingDeployment && (
        <DeploymentDepositModal
          handleCancel={() => setIsDepositingDeployment(false)}
          onDeploymentDeposit={onDeploymentDeposit}
          min={5} // TODO Query from chain params
          denom={sdlDenom}
          infoText={
            <Alert severity="info" sx={{ marginBottom: "1rem" }} variant="outlined">
              <Typography variant="caption">
                To create a deployment, you need to have at least <b>5 AKT</b> or <b>5 USDC</b> in an escrow account.{" "}
                <LinkTo onClick={ev => handleDocClick(ev, "https://docs.akash.network/glossary/escrow#escrow-accounts")}>
                  <strong>Learn more.</strong>
                </LinkTo>
              </Typography>
            </Alert>
          }
        />
      )}
      {isCheckingPrerequisites && <PrerequisiteList onClose={() => setIsCheckingPrerequisites(false)} onContinue={onPrerequisiteContinue} />}

      <form onSubmit={handleSubmit(onSubmit)} ref={formRef} autoComplete="off">
        <Paper sx={{ marginTop: "1rem", padding: "1rem" }} elevation={2}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Controller
              control={control}
              name={`services.0.image`}
              rules={{
                required: "Docker image name is required.",
                validate: value => {
                  const hasValidChars = /^[a-z0-9\-_/:.]+$/.test(value);

                  if (!hasValidChars) {
                    return "Invalid docker image name.";
                  }

                  return true;
                }
              }}
              render={({ field, fieldState }) => (
                <TextField
                  type="text"
                  variant="outlined"
                  label={`Docker Image / OS`}
                  placeholder="Example: mydockerimage:1.01"
                  color="secondary"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                  size="small"
                  value={field.value}
                  onChange={event => field.onChange((event.target.value || "").toLowerCase())}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Image alt="Docker Logo" src="/images/docker.png" layout="fixed" quality={100} width={24} height={18} priority />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          href={`https://hub.docker.com/search?q=${currentService.image?.split(":")[0]}&type=image`}
                          component={Link}
                          size="small"
                          target="_blank"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              )}
            />

            <CustomTooltip
              arrow
              title={
                <>
                  Docker image of the container.
                  <br />
                  <br />
                  Best practices: avoid using :latest image tags as Akash Providers heavily cache images.
                </>
              }
            >
              <InfoIcon color="disabled" fontSize="small" sx={{ marginLeft: ".5rem" }} />
            </CustomTooltip>
          </Box>

          <Box sx={{ marginTop: "1rem" }}>
            <GpuFormControl control={control as any} providerAttributesSchema={providerAttributesSchema} serviceIndex={0} hasGpu />
          </Box>

          <Box sx={{ marginTop: "1rem" }}>
            <CpuFormControl control={control as any} currentService={currentService} serviceIndex={0} />
          </Box>

          <Box sx={{ marginTop: "1rem" }}>
            <MemoryFormControl control={control as any} currentService={currentService} serviceIndex={0} />
          </Box>

          <Box sx={{ marginTop: "1rem" }}>
            <StorageFormControl control={control as any} currentService={currentService} serviceIndex={0} />
          </Box>

          <Grid container spacing={2} sx={{ marginTop: "1rem" }}>
            <Grid item xs={6}>
              <RegionSelect control={control} providerAttributesSchema={providerAttributesSchema} />
            </Grid>
            <Grid item xs={6}>
              <FormControl className={classes.formControl} fullWidth sx={{ display: "flex", alignItems: "center", flexDirection: "row" }}>
                <InputLabel id="grant-token">Token</InputLabel>
                <Controller
                  control={control}
                  name={`services.0.placement.pricing.denom`}
                  defaultValue=""
                  rules={{
                    required: true
                  }}
                  render={({ fieldState, field }) => {
                    return (
                      <Select
                        {...field}
                        labelId="sdl-token"
                        label="Token"
                        size="small"
                        error={!!fieldState.error}
                        fullWidth
                        MenuProps={{ disableScrollLock: true }}
                      >
                        {supportedSdlDenoms.map(token => (
                          <MenuItem key={token.id} value={token.value}>
                            {token.tokenLabel}
                          </MenuItem>
                        ))}
                      </Select>
                    );
                  }}
                />
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        <AdvancedConfig control={control} currentService={currentService} providerAttributesSchema={providerAttributesSchema} />

        <Box sx={{ paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Button color="secondary" variant="contained" type="submit">
              Deploy
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" variant="outlined" sx={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </form>
    </>
  );
};
